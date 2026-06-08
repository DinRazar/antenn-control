# -*- coding: utf-8 -*-
import copy
import importlib.util
import os
import threading
import time
from datetime import datetime
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uvicorn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_PATH = os.path.join(BASE_DIR, 'antenna-web-ui.html')
SRC_PATH = os.path.join(os.path.dirname(BASE_DIR), '..', 'antenna_ctl-1.py')
SRC_PATH = os.path.abspath(SRC_PATH)

spec = importlib.util.spec_from_file_location('antenna_ctl_src', SRC_PATH)
antenna = importlib.util.module_from_spec(spec)
spec.loader.exec_module(antenna)

app = FastAPI(title='Antenna Control UI')
lock = threading.RLock()

state = {
    'connected': False,
    'mode': None,
    'polling': False,
    'poll_interval': 1.0,
    'last_show_at': None,
    'last_show_pretty': None,
    'last_frame': None,
    'show': {},
    'log': [],
    'error': None,
}

transport = None
writer = None
stop_event = None
poll_thread = None
read_thread = None
read_buffer = ''


class ConnectReq(BaseModel):
    mode: str
    host: str = '192.168.1.1'
    port: int = 8899
    serial_dev: str = '/dev/ttyUSB0'
    baud: int = 38400
    poll_interval: float = 1.0


class PayloadReq(BaseModel):
    payload: str


class FrameReq(BaseModel):
    frame: str


def add_log(msg: str):
    ts = datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    with lock:
        state['log'].append(line)
        state['log'] = state['log'][-80:]


def parse_show_frame(frame: str):
    fields, err = antenna.split_fields(frame)
    if err:
        raise RuntimeError(err)
    if not fields or fields[0].lower() != 'show':
        raise RuntimeError('not a show frame')

    expected_fields = 18
    if len(fields) < expected_fields:
        raise RuntimeError(f'show frame too short: expected at least {expected_fields} fields, got {len(fields)}')

    get = lambda idx, default='': fields[idx] if idx < len(fields) else default
    status_raw = get(7)
    gps_raw = get(13)
    limit_raw = get(14)
    warning_raw = get(16)

    try:
        status_text = antenna.STATUS_MAP.get(int(status_raw), 'unknown') if status_raw != '' else ''
    except Exception:
        status_text = 'unknown'
    try:
        gps_text = antenna.GPS_MAP.get(int(gps_raw), 'unknown') if gps_raw != '' else ''
    except Exception:
        gps_text = 'unknown'

    limit_decoded = antenna.decode_limit(limit_raw)
    warning_decoded = antenna.decode_warning(warning_raw)

    parsed = {
        'field_count': len(fields),
        'frame_code': get(0),
        'preset_azimuth': get(1),
        'preset_elevation': get(2),
        'preset_polarization': get(3),
        'current_azimuth': get(4),
        'current_elevation': get(5),
        'current_polarization': get(6),
        'antenna_status_code': status_raw,
        'antenna_status_text': status_text,
        'antenna_status': f'{status_raw} ({status_text})' if status_raw != '' and status_text else status_raw,
        'carrier_heading_angle': get(8),
        'carrier_elevation': get(9),
        'carrier_roll_angle': get(10),
        'longitude': get(11),
        'latitude': get(12),
        'gps_status_code': gps_raw,
        'gps_status_text': gps_text,
        'gps_status': f'{gps_raw} ({gps_text})' if gps_raw != '' and gps_text else gps_raw,
        'limit_information': limit_raw,
        'limit_decoded': limit_decoded,
        'limit_decoded_text': '; '.join(limit_decoded) if limit_decoded else 'no limits',
        'agc_electrical_level': get(15),
        'warning_information': warning_raw,
        'warning_decoded': warning_decoded,
        'warning_decoded_text': '; '.join(warning_decoded) if warning_decoded else 'no warnings',
        'time': get(17),
        'raw_frame': frame.strip(),
        'raw_fields': fields,
    }
    return parsed


def close_all():
    global transport, writer, stop_event, poll_thread, read_thread, read_buffer
    if stop_event is not None:
        stop_event.set()
    if transport is not None:
        try:
            transport.close()
        except Exception:
            pass
    transport = None
    writer = None
    poll_thread = None
    read_thread = None
    stop_event = None
    read_buffer = ''
    with lock:
        state['connected'] = False
        state['polling'] = False
        state['mode'] = None


def read_loop():
    global read_buffer
    while stop_event is not None and not stop_event.is_set():
        try:
            chunk = transport.read_available()
        except Exception as e:
            add_log(f'Ошибка чтения: {e}')
            time.sleep(0.2)
            continue
        if not chunk:
            time.sleep(0.05)
            continue
        read_buffer += antenna.ensure_text(chunk)
        frames = []
        if '\n' in read_buffer or '\r' in read_buffer:
            frames = antenna.split_frames(read_buffer)
            if read_buffer.endswith('\n') or read_buffer.endswith('\r'):
                read_buffer = ''
            else:
                last_break_n = read_buffer.rfind('\n')
                last_break_r = read_buffer.rfind('\r')
                last_break = max(last_break_n, last_break_r)
                if last_break >= 0:
                    tail = read_buffer[last_break + 1:]
                    frames = antenna.split_frames(read_buffer[:last_break + 1])
                    read_buffer = tail
        for frame in frames:
            handle_frame(frame)


def handle_frame(frame: str):
    ok, data = antenna.verify_frame(frame)
    if not ok:
        add_log(f'Невалидный frame: {data} | {frame}')
        return
    with lock:
        state['last_frame'] = frame.strip()
    if frame.startswith('$show,'):
        try:
            parsed = parse_show_frame(frame)
            pretty = antenna.format_show(frame)
            with lock:
                state['show'] = parsed
                state['last_show_pretty'] = pretty
                state['last_show_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            add_log(f'SHOW: status={parsed.get("antenna_status_text", "") or parsed.get("antenna_status_code", "")}, gps={parsed.get("gps_status_text", "") or parsed.get("gps_status_code", "")}, warning={parsed.get("warning_information", "")}, limit={parsed.get("limit_information", "")}')
        except Exception as e:
            add_log(f'Ошибка parse show: {e}')
    else:
        add_log(f'RX: {frame.strip()}')


def poll_loop(interval: float):
    while stop_event is not None and not stop_event.is_set():
        try:
            frame = writer.send_payload('cmd,get show,')
            add_log(f'TX poll: {frame.strip()}')
        except Exception as e:
            add_log(f'Ошибка poll send: {e}')
        time.sleep(max(0.2, interval))


@app.get('/')
def index():
    return FileResponse(HTML_PATH)


@app.post('/api/connect')
def api_connect(req: ConnectReq):
    global transport, writer, stop_event, poll_thread, read_thread
    close_all()
    mode = req.mode.lower().strip()
    try:
        if mode == 'tcp':
            transport_obj = antenna.TcpTransport(req.host, req.port, antenna.DEFAULT_TCP_TIMEOUT)
        elif mode == 'serial':
            transport_obj = antenna.SerialTransport(req.serial_dev, req.baud, antenna.DEFAULT_SERIAL_TIMEOUT)
        else:
            raise RuntimeError('Unknown mode')
        writer_obj = antenna.SharedWriter(transport_obj)
        stop_obj = threading.Event()
        transport = transport_obj
        writer = writer_obj
        stop_event = stop_obj
        with lock:
            state['connected'] = True
            state['mode'] = mode
            state['polling'] = True
            state['poll_interval'] = req.poll_interval
            state['error'] = None
        read_thread = threading.Thread(target=read_loop, daemon=True)
        poll_thread = threading.Thread(target=poll_loop, args=(req.poll_interval,), daemon=True)
        read_thread.start()
        poll_thread.start()
        add_log(f'Подключено: mode={mode}')
        return {'ok': True, 'message': 'Подключение установлено'}
    except Exception as e:
        close_all()
        with lock:
            state['error'] = str(e)
        return {'ok': False, 'error': str(e)}


@app.post('/api/disconnect')
def api_disconnect():
    close_all()
    add_log('Отключено')
    return {'ok': True, 'message': 'Соединение закрыто'}


@app.post('/api/send_payload')
def api_send_payload(req: PayloadReq):
    if writer is None:
        return {'ok': False, 'error': 'Нет подключения'}
    try:
        frame = writer.send_payload(req.payload)
        add_log(f'TX payload: {req.payload}')
        return {'ok': True, 'frame': frame.strip()}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.post('/api/send_frame')
def api_send_frame(req: FrameReq):
    if writer is None:
        return {'ok': False, 'error': 'Нет подключения'}
    try:
        frame = req.frame
        if not frame.endswith('\r\n'):
            frame += '\r\n'
        writer.send_frame(frame)
        add_log(f'TX raw frame: {frame.strip()}')
        return {'ok': True, 'frame': frame.strip()}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.get('/api/state')
def api_state():
    with lock:
        return {'ok': True, 'state': copy.deepcopy(state)}


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=8000)
