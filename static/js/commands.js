// Отправка команды
async function sendCommand(payload) {
    const statusDiv = document.getElementById('cmdStatus');
    try {
        const resp = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload })
        });
        const result = await resp.json();
        statusDiv.innerText = '✓ ' + payload;
        statusDiv.style.color = '#27ae60';
        setTimeout(() => {
            if (statusDiv.innerText.includes('✓')) statusDiv.innerText = '';
        }, 3000);
    } catch (err) {
        statusDiv.innerText = '✗ ' + err.message;
        statusDiv.style.color = '#e74c3c';
    }
}

// Показать статус
function showStatus(msg) {
    const statusDiv = document.getElementById('cmdStatus');
    statusDiv.innerText = '✓ ' + msg;
    statusDiv.style.color = '#27ae60';
    setTimeout(() => {
        if (statusDiv.innerText.includes('✓')) statusDiv.innerText = '';
    }, 5000);
}

function manualSpeed() {
    let speed = prompt("Скорость (0.00..6.00)", "3.00");
    if (speed) sendCommand('cmd,manual,1,' + speed + ',');
}

function manualPosition() {
    let az = prompt("Азимут", "180.00");
    let el = prompt("Угол места", "21.50");
    let pol = prompt("Поляризация", "-90.00");
    if (az && el && pol) sendCommand('cmd,dir,' + az + ',' + el + ',' + pol + ',');
}

function setPosition() {
    let az = document.getElementById('az').value;
    let el = document.getElementById('el').value;
    let pol = document.getElementById('pol').value;
    if (az && el && pol) sendCommand('cmd,dir,' + az + ',' + el + ',' + pol + ',');
    else alert("Заполните все поля");
}

function setSpeed() {
    let speed = document.getElementById('speed').value;
    let adj = document.getElementById('adj').value;
    sendCommand('cmd,manual,' + adj + ',' + speed + ',');
}