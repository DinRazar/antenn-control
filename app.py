#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import time
import threading
import socket
import json
import os
from flask import Flask, render_template, request, jsonify

# Словарь статусов антенны (русский язык)
STATUS_MAP = {
    0: 'Ожидание',
    17: 'Развёртывание',
    18: 'Ошибка при развёртывании',
    19: 'Развёртывание завершено',
    20: 'Развёртывание приостановлено',
    33: 'Складывание',
    34: 'Ошибка при складывании',
    35: 'Складывание завершено',
    36: 'Складывание приостановлено',
    49: 'Наведение',
    50: 'Ошибка при наведении',
    51: 'Наведение выполнено',
    52: 'Наведение приостановлено',
    65: 'Запуск калибровки компаса',
    66: 'Калибровка компаса выполняется',
    67: 'Калибровка компаса выполнена',
    68: 'Ошибка при калибровки компаса',
    69: 'Калибровка компаса приостановлена',
    81: 'Сопровождение',
    83: 'Сопровождение выполнено',
    84: 'Сопровождение приостановлено',
    97: 'Ручное управление (скорость)',
    98: 'Ручное управление (позиция)',
    144: 'Ожидание',
    238: 'Перезагрузка хоста'
}

# Файл для хранения спутников
SATELLITES_FILE = 'satellites.json'

# Классы для работы с антенной
def ensure_text(value):
    if isinstance(value, bytes):
        return value.decode('ascii', 'ignore')
    return str(value) if value else ''

def build_frame(payload):
    return '$' + payload + '*hh\r\n'

class TcpTransport:
    def __init__(self, host, port, timeout=0.2):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(timeout)
        self.sock.connect((host, int(port)))
    def write_frame(self, frame):
        self.sock.sendall(frame.encode('ascii'))
    def read_chunk(self):
        try:
            return self.sock.recv(4096).decode('ascii', 'ignore')
        except:
            return ''
    def close(self):
        self.sock.close()

class AntennaSession:
    def __init__(self, transport, on_show):
        self.transport = transport
        self.on_show = on_show
        self.running = True
        self.buffer = ''
        self.antenna_params = None  # храним последние параметры [search_az, cal_el, cal_pol, cal_az, search_el, search_step]
        self.lock_threshold = None   # порог захвата
        self.read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self.read_thread.start()
        self.poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self.poll_thread.start()
        # Запросим параметры антенны при старте
        self.request_antenna_params()
        self.request_lock_threshold()

    def send_payload(self, payload):
        self.transport.write_frame(build_frame(payload))

    def request_antenna_params(self):
        """Отправить запрос на получение параметров антенны"""
        self.send_payload('cmd,get ant,')

    def request_lock_threshold(self):
        """Запросить текущий порог захвата"""
        self.send_payload('cmd,get lock,')

    def _read_loop(self):
        while self.running:
            chunk = self.transport.read_chunk()
            if chunk:
                self.buffer += chunk
                self._process_buffer()
            time.sleep(0.05)

    def _process_buffer(self):
        data = self.buffer.replace('\r\n', '\n').replace('\r', '\n')
        if '\n' not in data:
            self.buffer = data
            return
        parts = data.split('\n')
        self.buffer = parts[-1]
        for line in parts[:-1]:
            line = line.strip()
            if line.startswith('$show'):
                self.on_show(line)
            elif line.startswith('$cmd,ant,'):
                # Парсим параметры антенны
                # Формат: $cmd,ant,val1,val2,val3,val4,val5,val6,*xx
                try:
                    items = line.split(',')
                    if len(items) >= 8:
                        vals = [float(items[i]) for i in range(2, 8)]
                        self.antenna_params = vals
                        print(f"Antenna params updated: {vals}")
                except Exception as e:
                    print(f"Error parsing antenna params: {e}")
            elif line.startswith('$cmd,lock,'):
                # Формат: $cmd,lock,value,*xx
                try:
                    parts_line = line.split(',')
                    if len(parts_line) >= 3:
                        val_str = parts_line[2].split('*')[0]  # отрезаем чексумму
                        self.lock_threshold = float(val_str)
                        print(f"Lock threshold updated: {self.lock_threshold}")
                except Exception as e:
                    print(f"Error parsing lock threshold: {e}")
            elif line.startswith('$cmd,set lock ok') or line.startswith('$cmd,set lock ack'):
                print(f"Lock threshold set ack: {line}")
            elif line.startswith('$cmd,ant ack') or line.startswith('$cmd,ant ok'):
                print(f"Antenna params ack: {line}")

    def _poll_loop(self):
        while self.running:
            self.send_payload('cmd,get show,')
            time.sleep(1.0)

    def close(self):
        self.running = False
        self.transport.close()

# Flask приложение
app = Flask(__name__)

# Хранилище последних данных
latest_telemetry = {
    'cur_az': '--', 'tar_az': '--', 'cur_el': '--', 'tar_el': '--',
    'cur_pol': '--', 'tar_pol': '--', 'status': '--', 'status_code': None,
    'gps': '--', 'lon': '--', 'lat': '--', 'agc': '--', 'time': '--'
}

# Функции для работы со спутниками
def load_satellites():
    try:
        if os.path.exists(SATELLITES_FILE):
            with open(SATELLITES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            default_satellites = [
                {"id": 1, "name": "Sino5", "position": 110.5, "frequency": 12260.00, "polarization": 1},
                {"id": 2, "name": "AsiaSat 7", "position": 105.5, "frequency": 12400.00, "polarization": 0},
                {"id": 3, "name": "Satellite X", "position": -45.0, "frequency": 12600.00, "polarization": 1}
            ]
            save_satellites(default_satellites)
            return default_satellites
    except Exception as e:
        print(f"Error loading satellites: {e}")
        return []

def save_satellites(satellites):
    try:
        with open(SATELLITES_FILE, 'w', encoding='utf-8') as f:
            json.dump(satellites, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error saving satellites: {e}")
        return False

def parse_show(frame):
    if not frame.startswith('$show'):
        return None
    star = frame.find('*')
    payload = frame[1:star] if star != -1 else frame[1:]
    parts = payload.split(',')
    if len(parts) < 14:
        return None
    def clean(val):
        s = val.strip() if val else ''
        return s if s else '--'
    try:
        status_raw = clean(parts[7]) if len(parts) > 7 else '--'
        status_code = None
        status_text = status_raw
        if status_raw != '--':
            try:
                status_code = int(float(status_raw))
                status_text = STATUS_MAP.get(status_code, status_raw)
            except:
                status_text = status_raw
        
        return {
            'tar_az': clean(parts[1]) if len(parts) > 1 else '--',
            'tar_el': clean(parts[2]) if len(parts) > 2 else '--',
            'tar_pol': clean(parts[3]) if len(parts) > 3 else '--',
            'cur_az': clean(parts[4]) if len(parts) > 4 else '--',
            'cur_el': clean(parts[5]) if len(parts) > 5 else '--',
            'cur_pol': clean(parts[6]) if len(parts) > 6 else '--',
            'status': status_text,
            'status_code': status_code,
            'heading': clean(parts[8]) if len(parts) > 8 else '--',
            'carrier_el': clean(parts[9]) if len(parts) > 9 else '--',
            'roll': clean(parts[10]) if len(parts) > 10 else '--',
            'lon': clean(parts[11]) if len(parts) > 11 else '--',
            'lat': clean(parts[12]) if len(parts) > 12 else '--',
            'gps': clean(parts[13]) if len(parts) > 13 else '--',
            'limit': clean(parts[14]) if len(parts) > 14 else '--',
            'agc': clean(parts[15]) if len(parts) > 15 else '--',
            'warnings': clean(parts[16]) if len(parts) > 16 else '--',
            'time': clean(parts[17]) if len(parts) > 17 else '--'
        }
    except Exception as e:
        print(f"Parse error: {e}")
        return None

def on_show_callback(raw_frame):
    global latest_telemetry
    data = parse_show(raw_frame)
    if data:
        latest_telemetry = data

# Маршруты
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/telemetry')
def get_telemetry():
    return jsonify(latest_telemetry)

@app.route('/api/command', methods=['POST'])
def send_command():
    data = request.get_json()
    payload = data.get('payload')
    if not payload:
        return jsonify({'error': 'Missing payload'}), 400
    session.send_payload(payload)
    return jsonify({'status': 'sent', 'payload': payload})

# API для работы со спутниками
@app.route('/api/satellites', methods=['GET'])
def get_satellites():
    satellites = load_satellites()
    return jsonify(satellites)

@app.route('/api/satellites', methods=['POST'])
def add_satellite():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    name = data.get('name', '').strip()
    position = data.get('position')
    frequency = data.get('frequency')
    polarization = data.get('polarization')
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    if position is None or not isinstance(position, (int, float)) or position < -180 or position > 180:
        return jsonify({'error': 'Invalid position (-180..180)'}), 400
    if frequency is None or not isinstance(frequency, (int, float)):
        return jsonify({'error': 'Invalid frequency'}), 400
    if polarization not in [0, 1]:
        return jsonify({'error': 'Invalid polarization (0 or 1)'}), 400
    
    satellites = load_satellites()
    new_id = max([s.get('id', 0) for s in satellites], default=0) + 1
    new_sat = {
        'id': new_id,
        'name': name,
        'position': position,
        'frequency': frequency,
        'polarization': polarization
    }
    satellites.append(new_sat)
    if save_satellites(satellites):
        return jsonify(new_sat), 201
    else:
        return jsonify({'error': 'Failed to save satellite'}), 500

@app.route('/api/satellites/<int:sat_id>', methods=['DELETE'])
def delete_satellite(sat_id):
    satellites = load_satellites()
    satellites = [s for s in satellites if s.get('id') != sat_id]
    if save_satellites(satellites):
        return jsonify({'status': 'deleted'})
    else:
        return jsonify({'error': 'Failed to delete satellite'}), 500

# API для работы с параметрами антенны
@app.route('/api/antenna_params', methods=['GET'])
def get_antenna_params():
    if session.antenna_params is not None:
        params = session.antenna_params
        return jsonify({
            'search_az': params[0],
            'cal_el': params[1],
            'cal_pol': params[2],
            'cal_az': params[3],
            'search_el': params[4],
            'search_step': params[5]
        })
    else:
        return jsonify({'error': 'No data'}), 404

@app.route('/api/antenna_params', methods=['POST'])
def set_antenna_params():
    data = request.get_json()
    try:
        search_az = float(data['search_az'])
        cal_el = float(data['cal_el'])
        cal_pol = float(data['cal_pol'])
        cal_az = float(data['cal_az'])
        search_el = float(data['search_el'])
        search_step = float(data['search_step'])
    except (KeyError, TypeError, ValueError):
        return jsonify({'error': 'Invalid data'}), 400
    
    payload = f'cmd,ant,{search_az:.2f},{cal_el:.2f},{cal_pol:.2f},{cal_az:.2f},{search_el:.2f},{search_step:.2f},'
    session.send_payload(payload)
    return jsonify({'status': 'sent'})

# ---- НОВЫЙ API для порога захвата ----
@app.route('/api/lock_threshold', methods=['GET'])
def get_lock_threshold():
    if session.lock_threshold is not None:
        return jsonify({'value': session.lock_threshold})
    else:
        return jsonify({'error': 'No data'}), 404

@app.route('/api/lock_threshold', methods=['POST'])
def set_lock_threshold():
    data = request.get_json()
    try:
        value = float(data['value'])
    except (KeyError, TypeError, ValueError):
        return jsonify({'error': 'Invalid value'}), 400
    
    payload = f'cmd,set lock,{value:.2f},'
    session.send_payload(payload)
    return jsonify({'status': 'ok'})

# Запуск
def main():
    global session
    if len(sys.argv) < 3:
        print("Usage: python app.py tcp <IP> <PORT>")
        print("Example: python app.py tcp 192.168.1.3 8899")
        sys.exit(1)
    mode = sys.argv[1].lower()
    if mode != 'tcp':
        print("Only TCP mode is supported")
        sys.exit(1)
    host = sys.argv[2]
    port = int(sys.argv[3])

    transport = TcpTransport(host, port)
    session = AntennaSession(transport, on_show_callback)
    print(f"Connected to antenna at {host}:{port}")
    print(f"Satellites stored in: {SATELLITES_FILE}")
    print("Web interface: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)

if __name__ == '__main__':
    main()