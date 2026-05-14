# -*- coding: utf-8 -*-
from __future__ import print_function
import sys
import socket
import time

DEFAULT_HOST = '127.0.0.1'
DEFAULT_PORT = 8899


def ensure_text(value):
    if isinstance(value, bytes):
        try:
            return value.decode('ascii', 'ignore')
        except Exception:
            return value.decode('latin1', 'ignore')
    return value


def calc_checksum(payload):
    payload = ensure_text(payload)
    x = 0
    for ch in payload:
        x ^= ord(ch)
    return '%02x' % x


def build_frame(payload):
    return '$' + payload + '*' + calc_checksum(payload) + '\r\n'


def verify_frame(frame):
    frame = ensure_text(frame).strip()
    if not frame:
        return False, 'empty frame'
    if not frame.startswith('$'):
        return False, 'missing $'
    star = frame.rfind('*')
    if star < 0:
        return False, 'missing *'
    if star + 3 > len(frame):
        return False, 'checksum too short'
    payload = frame[1:star]
    given = frame[star + 1:star + 3].lower()
    calc = calc_checksum(payload)
    if given != calc:
        return False, 'checksum mismatch: got %s expected %s' % (given, calc)
    return True, payload


class AntennaState(object):
    def __init__(self):
        self.sat_name = 'Sino5'
        self.central_freq = '12260.00'
        self.carrier_freq = '0'
        self.carrier_rate = '0'
        self.sat_longitude = '110.50'
        self.polarization = '1'
        self.lock_limit = '5.00'

        self.longitude = '108.90'
        self.latitude = '34.10'
        self.heading = '180.04'

        self.rec_type = 'beacon'
        self.beacon_lo = '11300'
        self.beacon_mag = '1.0'
        self.dvb_lo = '11300'
        self.dvb_mag = '1.0'

        self.preset_az = '180.00'
        self.preset_el = '29.50'
        self.preset_pol = '0.00'

        self.current_az = '180.00'
        self.current_el = '29.50'
        self.current_pol = '0.00'

        self.status = '144'
        self.carrier_heading = '90.35'
        self.carrier_elevation = '2.11'
        self.carrier_roll = '-1.04'
        self.gps_status = '1'
        self.limit_info = '0'
        self.agc_level = '0.05'
        self.warning_info = '0'
        self.time_str = '26-05-14 09:07:00'

    def now_tick(self):
        self.time_str = time.strftime('%y-%m-%d %H:%M:%S', time.localtime())

    def show_payload(self):
        self.now_tick()
        fields = [
            'show',
            self.preset_az,
            self.preset_el,
            self.preset_pol,
            self.current_az,
            self.current_el,
            self.current_pol,
            self.status,
            self.carrier_heading,
            self.carrier_elevation,
            self.carrier_roll,
            self.longitude,
            self.latitude,
            self.gps_status,
            self.limit_info,
            self.agc_level,
            self.warning_info,
            self.time_str
        ]
        return ','.join(fields) + ','

    def sat_payload(self):
        return 'cmd,sat,%s,%s,%s,%s,%s,%s,%s,' % (
            self.sat_name,
            self.central_freq,
            self.carrier_freq,
            self.carrier_rate,
            self.sat_longitude,
            self.polarization,
            self.lock_limit
        )

    def place_payload(self):
        return 'cmd,place,%s,%s,%s,' % (
            self.longitude,
            self.latitude,
            self.heading
        )

    def beacon_payload(self):
        return 'cmd,beacon,%s,%s,' % (self.beacon_lo, self.beacon_mag)

    def dvb_payload(self):
        return 'cmd,dvb,%s,%s,' % (self.dvb_lo, self.dvb_mag)


def ack_payload(command_name):
    return 'cmd,%s ack,' % command_name


def ok_payload(command_name):
    return 'cmd,%s ok,' % command_name


def para_error_payload():
    return 'cmd,para error,'


def order_error_payload():
    return 'cmd,order error,'


def xor_error_payload():
    return 'cmd,xor error,'


def handle_payload(state, payload):
    parts = payload.split(',')
    if len(parts) < 2 or parts[0] != 'cmd':
        return build_frame(order_error_payload())

    if payload == 'cmd,get show,':
        return build_frame(state.show_payload())
    if payload == 'cmd,set show,':
        return build_frame(state.show_payload())
    if payload == 'cmd,get sat,':
        return build_frame(state.sat_payload())
    if payload == 'cmd,get place,':
        return build_frame(state.place_payload())
    if payload == 'cmd,get rec type,':
        return build_frame('cmd,rec type,%s,' % state.rec_type)
    if payload == 'cmd,get beacon,':
        return build_frame(state.beacon_payload())
    if payload == 'cmd,get dvb,':
        return build_frame(state.dvb_payload())

    if payload == 'cmd,reset,':
        state.status = '19'
        state.current_az = state.preset_az
        state.current_el = state.preset_el
        state.current_pol = state.preset_pol
        return build_frame(ack_payload('reset'))

    if payload == 'cmd,search,':
        state.status = '51'
        state.agc_level = '4.80'
        return build_frame(ack_payload('search'))

    if payload == 'cmd,stow,':
        state.status = '35'
        state.current_az = '0.00'
        state.current_el = '0.00'
        state.current_pol = '0.00'
        return build_frame(ack_payload('stow'))

    if payload == 'cmd,stop,':
        state.status = '144'
        return build_frame(ack_payload('stop'))

    if len(parts) >= 3 and parts[1] == 'manual':
        state.status = '97'
        return build_frame(ack_payload('manual'))

    if len(parts) >= 5 and parts[1] == 'dir':
        state.status = '98'
        state.preset_az = parts[2]
        state.preset_el = parts[3]
        state.preset_pol = parts[4]
        state.current_az = parts[2]
        state.current_el = parts[3]
        state.current_pol = parts[4]
        return build_frame(ack_payload('dir'))

    if len(parts) >= 8 and parts[1] == 'sat':
        state.sat_name = parts[2]
        state.central_freq = parts[3]
        state.carrier_freq = parts[4]
        state.carrier_rate = parts[5]
        state.sat_longitude = parts[6]
        state.polarization = parts[7]
        state.lock_limit = parts[8] if len(parts) > 8 and parts[8] != '' else state.lock_limit
        return build_frame(ok_payload('set sat'))

    if len(parts) >= 5 and parts[1] == 'place':
        state.longitude = parts[2]
        state.latitude = parts[3]
        if parts[4] != ' ' and parts[4] != '':
            state.heading = parts[4]
        return build_frame(ok_payload('set place'))

    if len(parts) >= 4 and parts[1] == 'set rec':
        state.rec_type = parts[2]
        return build_frame(ok_payload('set rec'))

    if len(parts) >= 5 and parts[1] == 'set beacon':
        state.beacon_lo = parts[2]
        state.beacon_mag = parts[3]
        return build_frame(ok_payload('set beacon'))

    if len(parts) >= 5 and parts[1] == 'set dvb':
        state.dvb_lo = parts[2]
        state.dvb_mag = parts[3]
        return build_frame(ok_payload('set dvb'))

    return build_frame(para_error_payload())


def run_server(host, port):
    state = AntennaState()
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind((host, port))
    except OSError:
        print('ERROR: address %s:%s is already in use' % (host, port))
        print('Hint 1: stop previous emulator process')
        print('Hint 2: run on another port, for example: python antenna_emulator.py %s 8900' % host)
        return 1
    server.listen(5)
    print('Antenna emulator listening on %s:%s' % (host, port))
    print('Press Ctrl+C to stop')

    while True:
        conn, addr = server.accept()
        print('Client connected from %s:%s' % addr)
        try:
            buf = ''
            while True:
                data = conn.recv(4096)
                if not data:
                    break
                buf += ensure_text(data)
                while '\n' in buf:
                    line, buf = buf.split('\n', 1)
                    line = line.strip('\r')
                    if not line:
                        continue
                    print('RX  : %r' % line)
                    ok, payload = verify_frame(line)
                    if not ok:
                        tx = build_frame(xor_error_payload())
                        print('ERR : %s' % payload)
                    else:
                        print('PAY : %s' % payload)
                        print('XOR : %s' % calc_checksum(payload))
                        tx = handle_payload(state, payload)
                    print('TX  : %r' % tx.strip())
                    conn.sendall(tx.encode('ascii'))
        finally:
            try:
                conn.close()
            except Exception:
                pass
            print('Client disconnected')


def run_demo():
    state = AntennaState()
    samples = [
        'cmd,get show,',
        'cmd,get sat,',
        'cmd,get place,',
        'cmd,search,',
        'cmd,manual,1,3.00',
        'cmd,dir,180.00,21.50,-90.00,',
        'cmd,set rec,beacon,',
        'cmd,set beacon,11300,1.0,',
        'cmd,set dvb,11300,1.0,',
        'cmd,stop,'
    ]
    print('Offline demo mode')
    print('=================')
    for payload in samples:
        frame = build_frame(payload)
        print('SEND:', repr(frame))
        print('XOR :', calc_checksum(payload))
        reply = handle_payload(state, payload)
        print('RECV:', repr(reply))
        print('')

    bad = '$cmd,stop,*00\r\n'
    print('Checksum error demo')
    print('SEND:', repr(bad))
    ok, info = verify_frame(bad)
    print('OK  :', ok)
    print('INFO:', info)
    if not ok:
        print('RECV:', repr(build_frame(xor_error_payload())))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'demo':
        run_demo()
        return 0

    host = DEFAULT_HOST
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        host = sys.argv[1]
    if len(sys.argv) > 2:
        port = int(sys.argv[2])
    return run_server(host, port)


if __name__ == '__main__':
    sys.exit(main())
