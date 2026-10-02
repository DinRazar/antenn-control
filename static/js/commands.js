async function sendCommand(payload) {
    try {
        await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload })
        });
    } catch (err) {
        console.warn('Command error:', err);
    }
}

// --- Сброс сессии (развёртывание / складывание) ---
// При этих операциях антенна меняет ориентацию, поправки теряют смысл.

function resetSession() {
    stopRequested = true;
    pointingInProgress = false;
    sendCommand('cmd,reset,');
    clearSessionCorrections();
}

function stowSession() {
    stopRequested = true;
    pointingInProgress = false;
    sendCommand('cmd,stow,');
    clearSessionCorrections();
}

function clearSessionCorrections() {
    App.refCorrections = null;
    App.referenceSatellite = null;
    App.committedSatellite = null;
    if (typeof updateCorrectionsDisplay === 'function') updateCorrectionsDisplay();
    if (typeof updateRefModeButton === 'function') updateRefModeButton();

    const block = document.getElementById('autoStatusBlock');
    if (block) block.style.display = 'none';

    if (App.mode === 'reference') {
        const autoBtn = document.querySelector('#modeToggle .btn[data-mode="auto"]');
        if (autoBtn) autoBtn.click();
    }
}

// --- Ручное управление ---

function manualSpeed() {
    const speed = prompt("Скорость (0.00..6.00)", "3.00");
    if (speed) sendCommand('cmd,manual,1,' + speed + ',');
}

function manualPosition() {
    const az = prompt("Азимут", "180.00");
    const el = prompt("Угол места", "21.50");
    const pol = prompt("Поляризация", "-90.00");
    if (az && el && pol) sendCommand('cmd,dir,' + az + ',' + el + ',' + pol + ',');
}

function setPosition() {
    const az = document.getElementById('az').value;
    const el = document.getElementById('el').value;
    const pol = document.getElementById('pol').value;
    if (az && el && pol) sendCommand('cmd,dir,' + az + ',' + el + ',' + pol + ',');
    else alert("Заполните все поля");
}

function setSpeed() {
    const speed = document.getElementById('speed').value;
    const adj = document.getElementById('adj').value;
    if (speed && adj) sendCommand('cmd,manual,' + adj + ',' + speed + ',');
    else alert("Заполните все поля");
}