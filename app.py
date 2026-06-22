#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import time
import threading
import socket
from flask import Flask, render_template, request, jsonify

# Словарь статусов антенны (русский язык)

STATUS_MAP = {
    0: 'Бездействие',
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
    238: 'Перезагрузка хоста'
}

# Классы для работы с антенной 

def ensure_text(value):
    if isinstance(value, bytes):
        return value.decode('ascii', 'ignore')
    return str(value) if value else ''

def build_frame(payload):
    # Всегда отправляем '*hh' 
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
        self.read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self.read_thread.start()
        self.poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self.poll_thread.start()
    def send_payload(self, payload):
        self.transport.write_frame(build_frame(payload))
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
    def _poll_loop(self):
        while self.running:
            self.send_payload('cmd,get show,')
            time.sleep(1.0)
    def close(self):
        self.running = False
        self.transport.close()

# Flask приложение (polling через fetch)

app = Flask(__name__)

# Хранилище последних данных
latest_telemetry = {
    'cur_az': '--', 'tar_az': '--', 'cur_el': '--', 'tar_el': '--',
    'cur_pol': '--', 'tar_pol': '--', 'status': '--', 'status_code': None,
    'gps': '--', 'lon': '--', 'lat': '--', 'agc': '--', 'time': '--'
}

def parse_show(frame):
    """Парсер, устойчивый к пустым полям (пробел или пустая строка)"""
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
        # Пытаемся преобразовать статус в число для поиска в словаре
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
            'status': status_text,              # теперь здесь текст
            'status_code': status_code,         # сохраняем код для справки
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
    print("Web interface: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)

if __name__ == '__main__':
    main()
