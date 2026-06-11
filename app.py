#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import time
import threading
import socket
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit

# ------------------------------------------------------------
# Классы для работы с антенной (без вычисления контрольной суммы)
# ------------------------------------------------------------
def ensure_text(value):
    if isinstance(value, bytes):
        return value.decode('ascii', 'ignore')
    return str(value) if value else ''

def build_frame(payload):
    # Всегда отправляем '*hh' – как в оригинальном скрипте
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

# ------------------------------------------------------------
# Flask + SocketIO
# ------------------------------------------------------------
app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# Хранилище последних данных телеметрии
latest_telemetry = {
    'cur_az': '--', 'tar_az': '--', 'cur_el': '--', 'tar_el': '--',
    'cur_pol': '--', 'tar_pol': '--', 'status': '--', 'gps': '--',
    'lon': '--', 'lat': '--', 'agc': '--', 'time': '--'
}

def parse_show(frame):
    if not frame.startswith('$show'):
        return None
    star = frame.find('*')
    payload = frame[1:star] if star != -1 else frame[1:]
    parts = payload.split(',')
    if len(parts) < 18:
        return None
    try:
        return {
            'tar_az': parts[1], 'tar_el': parts[2], 'tar_pol': parts[3],
            'cur_az': parts[4], 'cur_el': parts[5], 'cur_pol': parts[6],
            'status': parts[7], 'heading': parts[8], 'carrier_el': parts[9],
            'roll': parts[10], 'lon': parts[11], 'lat': parts[12],
            'gps': parts[13], 'limit': parts[14], 'agc': parts[15],
            'warnings': parts[16], 'time': parts[17] if len(parts) > 17 else ''
        }
    except:
        return None

def on_show_callback(raw_frame):
    global latest_telemetry
    data = parse_show(raw_frame)
    if data:
        latest_telemetry = data
        socketio.emit('telemetry', data)   # отправляем всем клиентам

# ------------------------------------------------------------
# Маршруты
# ------------------------------------------------------------
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

# ------------------------------------------------------------
# Запуск
# ------------------------------------------------------------
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
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)

if __name__ == '__main__':
    main()