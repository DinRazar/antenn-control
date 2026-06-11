const socket = io();

// Обновление телеметрии в реальном времени
socket.on('telemetry', (data) => {
    document.getElementById('cur_az').innerText = data.cur_az || '--';
    document.getElementById('tar_az').innerText = data.tar_az || '--';
    document.getElementById('cur_el').innerText = data.cur_el || '--';
    document.getElementById('tar_el').innerText = data.tar_el || '--';
    document.getElementById('cur_pol').innerText = data.cur_pol || '--';
    document.getElementById('tar_pol').innerText = data.tar_pol || '--';
    document.getElementById('status').innerText = data.status || '--';
    document.getElementById('gps').innerText = data.gps || '--';
    document.getElementById('lon').innerText = data.lon || '--';
    document.getElementById('lat').innerText = data.lat || '--';
    document.getElementById('agc').innerText = data.agc || '--';
    document.getElementById('time').innerText = data.time || '--';
});

// Первоначальная загрузка через REST (на случай, если SocketIO ещё не подключился)
fetch('/api/telemetry')
    .then(r => r.json())
    .then(data => {
        if (data.cur_az) {
            // Обновляем вручную
            for (const [key, value] of Object.entries(data)) {
                const el = document.getElementById(key);
                if (el) el.innerText = value || '--';
            }
        }
    });

// Отправка команды на сервер
async function sendCommand(payload) {
    const statusDiv = document.getElementById('cmdStatus');
    try {
        const response = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload })
        });
        const result = await response.json();
        statusDiv.innerText = `✅ Команда отправлена: ${payload}`;
        setTimeout(() => {
            if (statusDiv.innerText.includes('✅')) statusDiv.innerText = '';
        }, 3000);
    } catch (err) {
        statusDiv.innerText = `❌ Ошибка: ${err.message}`;
    }
}

function manualSpeed() {
    let speed = prompt("Скорость (0.00..6.00)", "3.00");
    if (speed) sendCommand(`cmd,manual,1,${speed},`);
}

function manualPosition() {
    let az = prompt("Азимут", "180.00");
    let el = prompt("Угол места", "21.50");
    let pol = prompt("Поляризация", "-90.00");
    if (az && el && pol) sendCommand(`cmd,dir,${az},${el},${pol},`);
}

function setPosition() {
    let az = document.getElementById('az').value;
    let el = document.getElementById('el').value;
    let pol = document.getElementById('pol').value;
    if (az && el && pol) sendCommand(`cmd,dir,${az},${el},${pol},`);
    else alert("Заполните все поля");
}

function setSpeed() {
    let speed = document.getElementById('speed').value;
    let adj = document.getElementById('adj').value;
    sendCommand(`cmd,manual,${adj},${speed},`);
}