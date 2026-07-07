async function fetchTelemetry() {
    try {
        const response = await fetch('/api/telemetry');
        const data = await response.json();
        
        const curAz = parseFloat(data.cur_az) || 0;
        const tarAz = parseFloat(data.tar_az) || 0;
        let curEl = parseFloat(data.cur_el) || 0;
        const tarEl = parseFloat(data.tar_el) || 0;
        const curPol = parseFloat(data.cur_pol) || 0;
        const tarPol = parseFloat(data.tar_pol) || 0;
        
        App.currentAz = curAz;
        App.currentEl = Math.max(0, curEl);
        App.targetAz = tarAz;
        App.targetEl = tarEl;
        
        // Определяем режим отображения
        const statusCode = data.status_code;
        const statusText = data.status || '';
        const autoCodes = [49, 50, 51, 52, 81, 82, 83, 84];
        App.showSearchRange = autoCodes.includes(statusCode) || 
                               statusText.includes('Наведение') || 
                               statusText.includes('Сопровождение');
        
        const elDiff = curEl - App.prevEl;
        const isDeploying = statusText.includes('Развёртывание') || statusCode === 17 || statusCode === 19;
        const isStowing = statusText.includes('Складывание') || statusCode === 33 || statusCode === 35;
        
        let displayEl, displayElText;
        if (curEl < 0 && (isDeploying || isStowing || elDiff !== 0)) {
            if (isDeploying || elDiff > 0) {
                displayElText = 'Идёт развёртывание';
            } else if (isStowing || elDiff < 0) {
                displayElText = 'Идёт складывание';
            } else {
                displayElText = 'Позиционирование';
            }
            displayEl = '--';
        } else if (curEl >= 0) {
            displayEl = curEl.toFixed(1) + '°';
            displayElText = curEl.toFixed(1) + '°';
        } else {
            displayEl = '--°';
            displayElText = '--°';
        }
        
        // Обновляем DOM
        document.getElementById('cur_az').innerHTML = curAz.toFixed(1) + '°';
        document.getElementById('tar_az').innerText = tarAz.toFixed(1);
        
        const elElement = document.getElementById('cur_el');
        elElement.innerHTML = displayElText;
        elElement.style.fontSize = (curEl < 0 && (isDeploying || isStowing || elDiff !== 0)) ? '18px' : '24px';
        
        document.getElementById('tar_el').innerText = tarEl.toFixed(1);
        document.getElementById('cur_pol').innerHTML = curPol.toFixed(1) + '°';
        document.getElementById('tar_pol').innerText = tarPol.toFixed(1);
        document.getElementById('agc').innerHTML = (data.agc || '--') + ' В';
        
        document.getElementById('status').innerText = data.status || '--';
        if (data.status_code !== null && data.status_code !== undefined) {
            document.getElementById('status_code').innerText = 'Код: ' + data.status_code;
        }
        
        document.getElementById('gps').innerText = data.gps || '--';
        document.getElementById('lon').innerText = data.lon || '--';
        document.getElementById('lat').innerText = data.lat || '--';
        
        // Перерисовка
        drawAzimuth(curAz);
        drawElevation(Math.max(0, curEl));
        document.getElementById('azimuthValue').innerText = curAz.toFixed(1) + '°';
        
        const elVizValue = document.getElementById('elevationValue');
        if (curEl < 0 && (isDeploying || isStowing || elDiff !== 0)) {
            elVizValue.innerText = displayElText;
            elVizValue.style.fontSize = '14px';
        } else {
            elVizValue.innerText = Math.max(0, curEl).toFixed(1) + '°';
            elVizValue.style.fontSize = '16px';
        }
        
        App.prevEl = curEl;
    } catch (err) {
        console.warn("Telemetry fetch error:", err);
    }
}