# -*- coding: utf-8 -*-
from __future__ import print_function
import sys
import socket
import time

try:
    import serial
except ImportError:
    serial = None

DEFAULT_TCP_TIMEOUT = 1.0
DEFAULT_SERIAL_TIMEOUT = 0.3
DEFAULT_RETRIES = 3
DEFAULT_DELAY = 0.1

try:
    input_func = raw_input
except NameError:
    input_func = input


STATUS_MAP = {
    17: 'reset starting',
    18: 'reset failed',
    19: 'reset accomplished',
    20: 'reset suspended',
    33: 'restow starts',
    34: 'restow failed',
    35: 'restow accomplished',
    36: 'restow suspended',
    49: 'aiming starts',
    50: 'aiming failed',
    51: 'aiming accomplished',
    52: 'aiming suspended',
    65: 'compass calibration starts',
    66: 'in compass calibration',
    67: 'compass calibration accomplished',
    68: 'compass calibration failed',
    69: 'compass calibration suspended',
    81: 'tracking',
    83: 'tracking accomplished',
    84: 'tracking suspended',
    97: 'manual operation speed',
    98: 'manual operation position',
    144: 'idleness',
    238: 'host restart'
}

GPS_MAP = {
    0: 'GPS invalid',
    1: 'GPS locked',
    2: 'GPS unlocked'
}

LIMIT_BITS = [
    (0x0001, 'Polarization hard inverse limit'),
    (0x0002, 'Polarization hard-limit'),
    (0x0004, 'Elevation hard lower limit'),
    (0x0008, 'Elevation hard upper limit'),
    (0x0010, 'Azimuth hard right limit'),
    (0x0020, 'Azimuth hard left limit'),
    (0x0040, 'Polarization hard zero'),
    (0x0080, 'Elevation hard zero'),
    (0x0100, 'Azimuth hard zero'),
    (0x0200, 'Polarization soft inverse limit'),
    (0x0400, 'Polarization soft-limit'),
    (0x0800, 'Elevation soft lower limit'),
    (0x1000, 'Elevation soft upper limit'),
    (0x2000, 'Azimuth soft right limit'),
    (0x4000, 'Azimuth soft left limit')
]

WARNING_BITS = [
    (0x00000001, 'E0', 'Azimuth drive abnormality'),
    (0x00000002, 'E1', 'Elevation drive abnormality'),
    (0x00000004, 'E2', 'Polarization drive abnormality'),
    (0x00000008, 'E3', 'GPS unconnected'),
    (0x00000010, 'E4', 'Compass unconnected'),
    (0x00000020, 'E5', 'Beacon receiver unconnected'),
    (0x00000040, 'E6', 'DVB receiver unconnected'),
    (0x00000080, 'E7', 'Polarization zeroing failed'),
    (0x00000100, 'E8', 'Azimuth zeroing failed'),
    (0x00000200, 'E9', 'Elevation zeroing failed'),
    (0x00000400, 'E10', 'Azimuth position tracking error'),
    (0x00000800, 'E11', 'Elevation position tracking error'),
    (0x00001000, 'E12', 'Inclinometer unconnected'),
    (0x00002000, 'E13', 'Beacon setting failed'),
    (0x00004000, 'E14', 'Reset angle of antenna'),
    (0x00008000, 'E15', 'Limit switch error'),
    (0x00010000, 'E16', 'Restow error'),
    (0x00020000, 'E17', 'Data out-of-range 1'),
    (0x00040000, 'E18', 'Data out-of-range 2'),
    (0x00080000, 'E19', 'Data out-of-range 3'),
    (0x00100000, 'E20', 'Hardware error 1'),
    (0x00200000, 'E21', 'Abnormal CAN communication'),
    (0x00400000, 'E22', 'Abnormal communication'),
    (0x08000000, 'W1', 'GPS not located'),
    (0x10000000, 'W2', 'Movement restriction protection')
]


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


def build_frame(payload):
    payload = ensure_text(payload)
    return '$' + payload + '*hh\r\n'


def split_fields(frame):
    ok, data = verify_frame(frame)
    if not ok:
        return None, data
    return data.split(','), None


def decode_limit(value):
    try:
        num = int(str(value).strip())
    except Exception:
        return []
    out = []
    for bit, name in LIMIT_BITS:
        if num & bit:
            out.append(name)
    return out


def decode_warning(value):
    try:
        num = int(str(value).strip())
    except Exception:
        return []
    out = []
    for bit, code, name in WARNING_BITS:
        if num & bit:
            out.append('%s %s' % (code, name))
    return out


def format_show(frame):
    fields, err = split_fields(frame)
    if err:
        return 'Invalid show frame: %s' % err
    if not fields or fields[0].lower() != 'show':
        return 'Not a show frame'
    labels = [
        'preset azimuth', 'preset elevation', 'preset polarization',
        'current azimuth', 'current elevation', 'current polarization',
        'antenna status', 'carrier heading angle', 'carrier elevation',
        'carrier roll angle', 'longitude', 'latitude', 'GPS status',
        'limit information', 'AGC electrical level', 'warning information',
        'time'
    ]
    lines = []
    i = 1
    for label in labels:
        if i >= len(fields):
            break
        value = fields[i]
        if label == 'antenna status':
            try:
                status_num = int(value)
                value = '%s (%s)' % (value, STATUS_MAP.get(status_num, 'unknown'))
            except Exception:
                pass
        elif label == 'GPS status':
            try:
                gps_num = int(value)
                value = '%s (%s)' % (value, GPS_MAP.get(gps_num, 'unknown'))
            except Exception:
                pass
        elif label == 'limit information':
            decoded = decode_limit(value)
            if decoded:
                value = '%s -> %s' % (value, '; '.join(decoded))
        elif label == 'warning information':
            decoded = decode_warning(value)
            if decoded:
                value = '%s -> %s' % (value, '; '.join(decoded))
        lines.append('%-22s : %s' % (label, value))
        i += 1
    return '\n'.join(lines)


class TcpTransport(object):
    def __init__(self, host, port, timeout):
        self.host = host
        self.port = int(port)
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(timeout)
        self.sock.connect((host, self.port))

    def send_and_recv(self, frame):
        data = frame.encode('ascii')
        self.sock.sendall(data)
        try:
            return ensure_text(self.sock.recv(4096))
        except socket.timeout:
            return ''

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


class SerialTransport(object):
    def __init__(self, dev, baud, timeout):
        if serial is None:
            raise RuntimeError('pyserial is not installed')
        self.ser = serial.Serial(dev, baudrate=int(baud), bytesize=8, parity='N', stopbits=1, timeout=timeout)

    def send_and_recv(self, frame):
        data = frame.encode('ascii')
        self.ser.write(data)
        time.sleep(DEFAULT_DELAY)
        try:
            return ensure_text(self.ser.read(4096))
        except Exception:
            return ''

    def close(self):
        try:
            self.ser.close()
        except Exception:
            pass


def ask(prompt, default=None):
    if default is None:
        text = input_func(prompt)
    else:
        text = input_func('%s [%s]: ' % (prompt, default))
        if not text.strip():
            text = str(default)
    return text.strip()


def send_with_retry(tr, payload, retries):
    frame = build_frame(payload)
    sys.stdout.write('\nSEND: %r\n' % frame)
    sys.stdout.flush()
    for attempt in range(1, retries + 1):
        reply = tr.send_and_recv(frame)
        if reply:
            sys.stdout.write('RECV: %r\n' % reply)
            sys.stdout.flush()
            return reply
        sys.stdout.write('No response, retry %d/%d\n' % (attempt, retries))
        sys.stdout.flush()
        time.sleep(DEFAULT_DELAY)
    return ''


def menu():
    print('')
    print('1 - Query state')
    print('2 - Stop')
    print('3 - Reset')
    print('4 - Search/Aiming')
    print('5 - Stow')
    print('6 - Manual speed mode')
    print('7 - Manual position mode')
    print('8 - Get satellite params')
    print('9 - Set satellite params')
    print('10 - Get local position')
    print('11 - Set local position')
    print('12 - Get receiver type')
    print('13 - Set receiver type')
    print('14 - Get beacon LO/magnification')
    print('15 - Set beacon LO/magnification')
    print('16 - Get DVB LO/magnification')
    print('17 - Set DVB LO/magnification')
    print('18 - Raw payload')
    print('19 - Checksum calculator')
    print('0 - Exit')


def main():
    if len(sys.argv) < 2:
        print('Usage:')
        print('  python antenna_ctl.py tcp 192.168.1.1 8899')
        print('  python antenna_ctl.py serial /dev/ttyUSB0 38400')
        return 1

    mode = sys.argv[1].lower()
    retries = DEFAULT_RETRIES

    if mode == 'tcp':
        if len(sys.argv) < 4:
            print('Need host and port')
            return 1
        tr = TcpTransport(sys.argv[2], int(sys.argv[3]), DEFAULT_TCP_TIMEOUT)
    elif mode == 'serial':
        if len(sys.argv) < 3:
            print('Need serial device')
            return 1
        baud = 38400
        if len(sys.argv) >= 4:
            baud = int(sys.argv[3])
        tr = SerialTransport(sys.argv[2], baud, DEFAULT_SERIAL_TIMEOUT)
    else:
        print('Unknown mode: %s' % mode)
        return 1

    try:
        while True:
            menu()
            choice = ask('Select')
            payload = None

            if choice == '0':
                break
            elif choice == '1':
                payload = 'cmd,get show,'
            elif choice == '2':
                payload = 'cmd,stop,'
            elif choice == '3':
                payload = 'cmd,reset,'
            elif choice == '4':
                payload = 'cmd,search,'
            elif choice == '5':
                payload = 'cmd,stow,'
            elif choice == '6':
                adj = ask('Adjusting (1..6)', '1')
                speed = ask('Speed (0.00..6.00)', '3.00')
                payload = 'cmd,manual,%s ,%s,' % (adj, speed)
            elif choice == '7':
                az = ask('Azimuth', '180.00')
                el = ask('Elevation', '21.50')
                pol = ask('Polarization', '-90.00')
                payload = 'cmd,dir,%s,%s,%s,' % (az, el, pol)
            elif choice == '8':
                payload = 'cmd,get sat,'
            elif choice == '9':
                sat = ask('Satellite name', 'Sino5')
                cf = ask('Central frequency MHz', '12260.00')
                carrier = ask('Carrier frequency MHz', '0')
                rate = ask('Carrier rate Kbaud', '0')
                lon = ask('Satellite longitude', '110.50')
                pol = ask('Polarization 0/1', '1')
                lock = ask('Lock limit V', '5.00')
                payload = 'cmd,sat,%s,%s,%s,%s,%s,%s,%s,' % (sat, cf, carrier, rate, lon, pol, lock)
            elif choice == '10':
                payload = 'cmd,get place,'
            elif choice == '11':
                lon = ask('Longitude', '108.90')
                lat = ask('Latitude', '34.10')
                head = ask('Heading (single space to keep current)', '180.04')
                payload = 'cmd,place,%s,%s,%s,' % (lon, lat, head)
            elif choice == '12':
                payload = 'cmd,get rec type,'
            elif choice == '13':
                rtype = ask('Receiver type beacon/dvb', 'beacon')
                payload = 'cmd,set rec,%s,' % rtype
            elif choice == '14':
                payload = 'cmd,get beacon,'
            elif choice == '15':
                lo = ask('Local oscillator MHz', '11300')
                mag = ask('Magnification', '1.0')
                payload = 'cmd,set beacon,%s,%s,' % (lo, mag)
            elif choice == '16':
                payload = 'cmd,get dvb,'
            elif choice == '17':
                lo = ask('Local oscillator MHz', '11300')
                mag = ask('Magnification', '1.0')
                payload = 'cmd,set dvb,%s,%s,' % (lo, mag)
            elif choice == '18':
                payload = ask('Payload without leading $ and without *hh')
            elif choice == '19':
                raw = ask('Payload for checksum')
                print('checksum = %s' % calc_checksum(raw))
                print('frame    = %r' % build_frame(raw))
                continue
            else:
                print('Unknown selection')
                continue

            reply = send_with_retry(tr, payload, retries)
            if not reply:
                print('No response after retries')
                continue

            ok, parsed = verify_frame(reply)
            if ok:
                print('Checksum OK')
                if reply.startswith('$show,'):
                    print('--- parsed show ---')
                    print(format_show(reply))
            else:
                print('Reply verify warning: %s' % parsed)
    finally:
        tr.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
