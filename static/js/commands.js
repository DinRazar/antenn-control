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
    App.refTheor = null;
    App.refActual = null;
    App.committedSatellite = null;

    // Сброс активного движения джойстика
    manualActiveDir = null;
    if (typeof updateJoyButtonsUI === 'function') updateJoyButtonsUI();

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

// ===== РУЧНОЙ ДЖОЙСТИК =====

let manualModeState = 'step';   // 'step' | 'continuous'
let manualActiveDir = null;     // для continuous: 1..6 или null

const MANUAL_DIR_CODES = {
    'az-right':  1,   // increase azimuth
    'az-left':   2,   // reduce azimuth
    'el-up':     3,   // increase elevation
    'el-down':   4,   // reduce elevation
    'pol-right': 5,   // increase polarization
    'pol-left':  6,   // reduce polarization
};

function initManualMode() {
    // ===== переключение Ручной ввод / Джойстик =====
    document.querySelectorAll('.manual-top-toggle .btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.manual-top-toggle .btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const tab = this.dataset.manualTab;
            document.getElementById('manualTab-direct').classList.toggle('hidden', tab !== 'direct');
            document.getElementById('manualTab-joystick').classList.toggle('hidden', tab !== 'joystick');

            // При уходе с джойстика — остановить любое движение
            if (tab !== 'joystick' && manualActiveDir !== null) {
                manualStop();
            }
        });
    });

    // ===== переключение Пошаговый / Непрерывный (внутри джойстика) =====
    document.querySelectorAll('.manual-mode-toggle .btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.manual-mode-toggle .btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            manualModeState = this.dataset.manualMode;

            const stepGroup  = document.getElementById('stepGroup');
            const speedGroup = document.getElementById('speedGroup');

            if (manualModeState === 'continuous') {
                speedGroup.style.display = '';
                stepGroup.style.display  = 'none';
            } else {
                stepGroup.style.display  = '';
                speedGroup.style.display = 'none';
                if (manualActiveDir !== null) manualStop();
            }
            updateJoyButtonsUI();
        });
    });
}

function manualAction(action) {
    if (manualModeState === 'step') {
        manualStep(action);
    } else {
        manualToggleContinuous(action);
    }
}

// ---- Пошаговый режим ----
function manualStep(action) {
    const rawStep = parseFloat(document.getElementById('manualStepInput').value);
    const step = (isNaN(rawStep) || rawStep <= 0) ? 1.0 : rawStep;

    let az  = App.targetAz;
    let el  = App.targetEl;
    let pol = App.targetPol;

    switch (action) {
        case 'az-left':  az  -= step; break;
        case 'az-right': az  += step; break;
        case 'el-up':    el  += step; break;
        case 'el-down':  el  -= step; break;
        case 'pol-left': pol -= step; break;
        case 'pol-right':pol += step; break;
    }

    // Нормализация
    az = ((az % 360) + 360) % 360;
    el = Math.max(0, Math.min(90, el));
    pol = Math.max(-90, Math.min(90, pol));

    sendCommand(`cmd,dir,${az.toFixed(2)},${el.toFixed(2)},${pol.toFixed(2)},`);
}

// ---- Непрерывный режим ----
async function manualToggleContinuous(action) {
    const dirCode = MANUAL_DIR_CODES[action];
    if (dirCode === undefined) return;

    if (manualActiveDir === dirCode) {
        manualStop();
        return;
    }

    if (manualActiveDir !== null) {
        sendCommand('cmd,stop,');
        await sleep(180);
    }

    const rawSpeed = parseFloat(document.getElementById('manualSpeedInput').value);
    let speed = (isNaN(rawSpeed) || rawSpeed <= 0) ? 3.0 : rawSpeed;
    speed = Math.max(0.1, Math.min(6.0, speed));

    sendCommand(`cmd,manual,${dirCode},${speed.toFixed(2)},`);
    manualActiveDir = dirCode;
    updateJoyButtonsUI();
}

function manualStop() {
    sendCommand('cmd,stop,');
    manualActiveDir = null;
    updateJoyButtonsUI();
}

function updateJoyButtonsUI() {
    document.querySelectorAll('.joy-btn').forEach(b => b.classList.remove('active'));
    if (manualActiveDir === null) return;

    const map = {1:'az-right',2:'az-left',3:'el-up',4:'el-down',5:'pol-right',6:'pol-left'};
    const act = map[manualActiveDir];
    if (act) {
        const btn = document.getElementById('joy-' + act);
        if (btn) btn.classList.add('active');
    }
}

document.addEventListener('DOMContentLoaded', initManualMode);