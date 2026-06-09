import './style.css';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// GSAP scroll reveals
document.querySelectorAll('.gs-reveal').forEach((elem) => {
  gsap.fromTo(elem, { autoAlpha: 0, y: 40 }, {
    duration: 1,
    autoAlpha: 1,
    y: 0,
    ease: 'power3.out',
    scrollTrigger: { trigger: elem, start: 'top 85%', toggleActions: 'play none none reverse' }
  });
});

// Theme logic
let isLight = false;
const themeBtn = document.querySelector('#theme');

if (themeBtn) {
  const saved = localStorage.getItem('portfolio-theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  isLight = saved === 'light';
  themeBtn.textContent = isLight ? 'Dark' : 'Light';
  themeBtn.addEventListener('click', () => {
    isLight = !isLight;
    document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
    localStorage.setItem('portfolio-theme', isLight ? 'light' : 'dark');
    themeBtn.textContent = isLight ? 'Dark' : 'Light';
    if (window.updateThreeTheme) window.updateThreeTheme();
  });
}

// Modals
const archModal = document.getElementById('arch-modal');
const elmsModal = document.getElementById('elms-modal');
const btnViewArch = document.getElementById('btn-view-arch');
if (btnViewArch) {
  btnViewArch.addEventListener('click', () => {
    const target = btnViewArch.dataset.modal || 'arch-modal';
    const modal = document.getElementById(target);
    if (modal) modal.classList.add('open');
  });
}
[archModal, elmsModal].forEach(m => {
  if (m) m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('open'); });
});

// Project card trace links
const elmsTraceLink = document.getElementById('elms-trace-link');
if (elmsTraceLink) {
  elmsTraceLink.addEventListener('click', () => {
    setTimeout(() => {
      const elmsBtn = document.querySelector('.trace-switch-btn[data-project="elms"]');
      if (elmsBtn) elmsBtn.click();
    }, 400);
  });
}
const rrTraceLink = document.getElementById('rr-trace-link');
if (rrTraceLink) {
  rrTraceLink.addEventListener('click', () => {
    setTimeout(() => {
      const rrBtn = document.querySelector('.trace-switch-btn[data-project="resumeradar"]');
      if (rrBtn) rrBtn.click();
    }, 400);
  });
}

// Live AWS
let hasPinged = false;
async function pingLiveServer() {
  if (hasPinged) return;
  const statusDot = document.getElementById('live-dot');
  const statusText = document.getElementById('live-text');
  const term = document.getElementById('terminal-output');
  if (!statusDot || !statusText || !term) return;
  hasPinged = true;

  statusDot.className = 'status-dot up';
  statusText.textContent = 'LIVE · AWS EC2';
  term.innerHTML += `\n<span class="log-info">> [AWS] ResumeRadar is LIVE at 18.60.44.43:8080</span>`;
  term.innerHTML += `\n<span class="log-debug">> [INFO] Browser CORS blocks direct ping from localhost.</span>`;
  term.innerHTML += `\n<span class="log-debug">> [INFO] Works normally on production domain.</span>`;
  term.innerHTML += `\n<span class="log-info">> Swagger UI: http://18.60.44.43:8080/swagger-ui/index.html</span>`;
}

// 3D SCENE VARIABLES (Globalized)
let camera, group, elmsGroup, renderer, scene;
let matNodeActive, matNodeIdle, matCore, matEdge;
let is3DReady = false;
window.is3DReady = false;

let nodes = [], particles = [], nPos = [];
let coreMesh;
const elmsLayers = [];
const particlePoolSize = 60;
const particlePool = [];
let poolIdx = 0;

window.updateThreeTheme = function() {
  if (!renderer || !scene) return;
  const bgColor = isLight ? 0xf0f4f8 : 0x07111d;
  renderer.setClearColor(bgColor, 1);
  scene.fog.color.setHex(bgColor);
  if (matNodeActive) matNodeActive.color.setHex(isLight ? 0x0D63CE : 0x00ffff);
  if (matNodeIdle) matNodeIdle.color.setHex(isLight ? 0x9fb0c2 : 0x3498db);
  if (matCore) matCore.color.setHex(isLight ? 0x0a8c7a : 0x00E676);
  if (matEdge) matEdge.color.setHex(isLight ? 0x0D63CE : 0x00E5FF);
};

// Project Switcher
let activeProject = 'resumeradar';
const switchBtns = document.querySelectorAll('.trace-switch-btn');
const rrButtons = document.getElementById('rr-stage-list');
const elmsButtons = document.getElementById('elms-stage-list');
const traceTitle = document.getElementById('trace-title');

switchBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (autoPlayTimeoutId) { clearTimeout(autoPlayTimeoutId); autoPlayTimeoutId = null; }
    
    switchBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeProject = btn.dataset.project;

    const statusRow = document.getElementById('aws-status-row');
    const archBtn = document.getElementById('btn-view-arch');
    const term = document.getElementById('terminal-output');

    if (activeProject === 'resumeradar') {
      if (group) group.visible = true;
      if (elmsGroup) elmsGroup.visible = false;
      if (rrButtons) rrButtons.style.display = 'flex';
      if (elmsButtons) elmsButtons.style.display = 'none';
      if (traceTitle) traceTitle.textContent = 'Async AI Polling Flow';
      if (statusRow) statusRow.style.display = 'flex';
      if (archBtn) { archBtn.textContent = 'View Architecture'; archBtn.dataset.modal = 'arch-modal'; }
      if (term) term.innerHTML = '> System ready. Click an endpoint to trace.';
      
      // Kill ELMS infinite bounce and clean up particle pool
      if (coreMesh) gsap.killTweensOf(coreMesh.position);
      particlePool.forEach(puff => {
        gsap.killTweensOf(puff.position);
        gsap.killTweensOf(puff.rotation);
        gsap.killTweensOf(puff.material);
        gsap.killTweensOf(puff.scale);
        puff.visible = false;
      });
      
      if (is3DReady && camera) {
        if (!camera.userData.lookTarget) camera.userData.lookTarget = { x: 0, y: 0, z: 0 };
        gsap.killTweensOf(camera.position);
        gsap.killTweensOf(camera.userData.lookTarget);
        gsap.to(camera.userData.lookTarget, { x: 0, y: 0, z: 0, duration: 1.5, ease: 'power3.inOut' });
        gsap.to(camera.position, { 
          x: 0, y: 2, z: 13, 
          duration: 1.5, ease: 'power3.inOut',
          onUpdate: () => { const lt = camera.userData.lookTarget || {x:0,y:0,z:0}; camera.lookAt(lt.x, lt.y, lt.z); }
        });
      }
    } else {
      if (group) group.visible = false;
      if (elmsGroup) elmsGroup.visible = true;
      if (rrButtons) rrButtons.style.display = 'none';
      if (elmsButtons) elmsButtons.style.display = 'flex';
      if (traceTitle) traceTitle.textContent = 'Role-Based Leave Flow';
      if (statusRow) statusRow.style.display = 'none';
      if (archBtn) { archBtn.textContent = 'View Architecture'; archBtn.dataset.modal = 'elms-modal'; }
      if (term) term.innerHTML = '> ELMS API \u2014 Not deployed (local only).\n> Click an endpoint to trace the flow.';
      
      if (is3DReady && camera) {
        if (!camera.userData.lookTarget) camera.userData.lookTarget = { x: 0, y: 0, z: 0 };
        gsap.killTweensOf(camera.position);
        gsap.killTweensOf(camera.userData.lookTarget);
        gsap.to(camera.userData.lookTarget, { x: 0, y: 0, z: 0, duration: 1.5, ease: 'power3.inOut' });
        gsap.to(camera.position, { 
          x: 0, y: 0, z: 11, 
          duration: 1.5, ease: 'power3.inOut',
          onUpdate: () => { const lt = camera.userData.lookTarget || {x:0,y:0,z:0}; camera.lookAt(lt.x, lt.y, lt.z); }
        });
      }
    }
  });
});

// ScrollTrigger for Trace Section
let traceAutoPlayed = false;
let hasEnteredOnce = false;
let autoPlayTimeoutId = null;
ScrollTrigger.create({
  trigger: '#trace-section',
  start: 'top 40%',
  end: 'bottom 80%',
  onEnter: () => {
    document.body.classList.add('show-3d');
    
    if (!hasEnteredOnce) {
      hasEnteredOnce = true;
      document.querySelectorAll('.click-hint').forEach(h => h.style.display = 'none');
      document.querySelectorAll('.pulse-hint').forEach(b => b.classList.remove('pulse-hint'));
      gsap.fromTo('.gs-trace', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'power2.out' });
    }
    
    pingLiveServer();
    
    if (!traceAutoPlayed) {
      traceAutoPlayed = true;
      const allBtns = document.querySelectorAll('#rr-stage-list .stage-button');
      if (allBtns.length > 0) {
        let idx = 0;
        function playNext() {
          if (idx >= allBtns.length) { autoPlayTimeoutId = null; return; }
          allBtns[idx].click();
          idx++;
          autoPlayTimeoutId = setTimeout(playNext, 2500);
        }
        autoPlayTimeoutId = setTimeout(playNext, 1800);
      }
    }
  },
  onLeave: () => document.body.classList.remove('show-3d'),
  onEnterBack: () => document.body.classList.add('show-3d'),
  onLeaveBack: () => document.body.classList.remove('show-3d')
});

// ========================================================
// GLOBALIZED UI BUTTON LOGIC (WebGL Debug Fix 1)
// ========================================================
let typeGeneration = 0; // Generation counter to cancel stale typeLines
function typeLines(terminal, lines, speed = 16) {
  const gen = ++typeGeneration;
  return new Promise((resolve) => {
    let lineIndex = 0;
    function nextLine() {
      if (gen !== typeGeneration) { resolve(); return; } // Stale — abort
      if (lineIndex >= lines.length) { resolve(); return; }
      const { text, cls } = lines[lineIndex++];
      const span = document.createElement('span');
      if (cls) span.className = cls;
      terminal.appendChild(document.createTextNode('\n'));
      terminal.appendChild(span);
      terminal.scrollTop = terminal.scrollHeight;
      let charIndex = 0;
      const interval = setInterval(() => {
        if (gen !== typeGeneration) { clearInterval(interval); resolve(); return; }
        span.textContent += text[charIndex++];
        terminal.scrollTop = terminal.scrollHeight;
        if (charIndex >= text.length) { clearInterval(interval); setTimeout(nextLine, 100); }
      }, speed);
    }
    nextLine();
  });
}

const rrLogs = [
  [
    { text: '> [HTTP] POST /api/analysis/score received', cls: 'log-info' },
    { text: '> Parsing multipart/form-data...', cls: 'log-debug' },
    { text: '> PDF extracted. Job description parsed.', cls: 'log-debug' },
    { text: '> Forwarding to Auth Gateway...', cls: 'log-info' },
  ],
  [
    { text: '> [SEC] JWT intercepted by Spring Security', cls: 'log-info' },
    { text: '> Validating HMAC-SHA256 signature...', cls: 'log-debug' },
    { text: '> [SEC] Token valid. Role: USER granted.', cls: 'log-info' },
    { text: '> Routing to API controller thread...', cls: 'log-debug' },
  ],
  [
    { text: '> [THREAD] Assigned to Virtual Thread #vt-019', cls: 'log-info' },
    { text: '> [DB] INSERT INTO analysis_requests ...', cls: 'log-debug' },
    { text: '> [DB] Record REQ-7782 Status: PENDING', cls: 'log-warn' },
    { text: '> [HTTP] Returning 202 Accepted to client.', cls: 'log-info' },
  ],
  [
    { text: '> [EXEC] ExecutorService picked up REQ-7782', cls: 'log-info' },
    { text: '> Connecting to Google Gemini API over TLS...', cls: 'log-debug' },
    { text: '> [AI] Streaming ATS analysis...', cls: 'log-warn' },
    { text: '> [AI] Score computed. Parsing JSON response.', cls: 'log-info' },
  ],
  [
    { text: '> [DB] UPDATE REQ-7782 SET status=COMPLETED', cls: 'log-info' },
    { text: '> [DB] ATS score stored. Payload ready.', cls: 'log-debug' },
    { text: '> [HTTP] GET /api/analysis/REQ-7782 received', cls: 'log-info' },
    { text: '> [HTTP] 200 OK — Full JSON payload returned.', cls: 'log-info' },
  ]
];

const elmsLogs = [
  [
    { text: '> [HTTP] POST /api/auth/register received', cls: 'log-info' },
    { text: '> Parsing name, email & password...', cls: 'log-debug' },
    { text: '> [DB] Saving new Employee to database...', cls: 'log-debug' },
    { text: '> [AUTH] JWT token generated & returned.', cls: 'log-info' },
  ],
  [
    { text: '> [HTTP] POST /api/auth/authenticate', cls: 'log-info' },
    { text: '> [SEC] Validating credentials...', cls: 'log-debug' },
    { text: '> [SEC] Credentials valid. Issuing JWT.', cls: 'log-info' },
    { text: '> [HTTP] 200 OK — JWT token returned.', cls: 'log-info' },
  ],
  [
    { text: '> [HTTP] POST /api/leave-requests/apply', cls: 'log-info' },
    { text: '> [SEC] JWT verified. Role: EMPLOYEE.', cls: 'log-debug' },
    { text: '> [BIZ] Duration auto-calculated from dates.', cls: 'log-debug' },
    { text: '> [DB] Record created — Status: PENDING.', cls: 'log-warn' },
  ],
  [
    { text: '> [HTTP] PUT /api/leave-requests/{id}/status', cls: 'log-info' },
    { text: '> [SEC] JWT verified. Role: MANAGER.', cls: 'log-debug' },
    { text: '> [DB] Status = APPROVED. Balance deducted.', cls: 'log-info' },
    { text: '> [HTTP] 200 OK — Leave approved.', cls: 'log-info' },
  ],
  [
    { text: '> [HTTP] GET /api/leave-requests/all', cls: 'log-info' },
    { text: '> [SEC] JWT verified. Role: MANAGER.', cls: 'log-debug' },
    { text: '> [DB] Fetching all leave records...', cls: 'log-debug' },
    { text: '> [HTTP] 200 OK — Full list returned.', cls: 'log-info' },
  ]
];

let lastActiveBtn = null;
let lastActiveNodeIdx = 0;
let rrTimeline = null; // Track active timeline to prevent race conditions

function handleStageClick(btn, i, logData) {
  // Cancel auto-play if user clicks manually
  if (autoPlayTimeoutId) { clearTimeout(autoPlayTimeoutId); autoPlayTimeoutId = null; }
  
  document.querySelectorAll('.stage-button').forEach(b => {
    b.classList.remove('active');
    b.classList.remove('pulse-hint');
  });
  btn.classList.add('active');
  
  document.querySelectorAll('.click-hint').forEach(h => h.style.display = 'none');

  // SCREEN READER A11Y UPDATE
  const a11yText = btn.querySelector('span').textContent;
  const announcer = document.getElementById('a11y-announcer');
  if (announcer) announcer.textContent = `System State: ${a11yText}`;

  const terminal = document.getElementById('terminal-output');
  terminal.innerHTML = `<span class="log-debug">> SYS.TRACE — STEP ${String(i+1).padStart(2,'0')} / 05</span>`;
  typeLines(terminal, logData[i]);

  // If WebGL is not loaded or disabled, abort the 3D portion safely.
  if (!window.is3DReady) return;

  const isELMS = (logData === elmsLogs);

  if (!isELMS) {
    nodes.forEach((n, idx) => { 
      gsap.killTweensOf(n.scale);
      const baseScale = (idx === 2) ? 1.5 : 1;
      n.scale.set(baseScale, baseScale, baseScale);
      n.material = (idx === 2) ? matCore : matNodeIdle; // Memory Debug Fix 3
    });
  }

  if (!isELMS) {
    if (rrTimeline) rrTimeline.kill(); // WebGL Debug Fix: Kill previous timeline entirely
    particles.forEach(pt => pt.visible = false); // Hide all unused particles
    
    // Always use the first particle for simplicity now that we kill the timeline
    const p = particles[0];
    p.position.copy(nPos[lastActiveNodeIdx]); 
    p.visible = true;
    p.material.color.setHex(0x00E5FF);
    gsap.killTweensOf(p.position);
    gsap.killTweensOf(p.scale);

    rrTimeline = gsap.timeline(); // Ball stays visible at destination until next click
    const tl = rrTimeline;
    
    const startIdx = lastActiveNodeIdx;
    const endIdx = i;
    
    // WebGL Debug Fix 3: Kill tweens before pan
    gsap.killTweensOf(camera.position);
    if (camera.userData.lookTarget) gsap.killTweensOf(camera.userData.lookTarget);
    if (!camera.userData.lookTarget) camera.userData.lookTarget = { x: 0, y: 0, z: 0 };
    
    let route = [];
    if (startIdx === endIdx) {
      route = []; // Same node, no routing needed
    } else {
      const step = startIdx < endIdx ? 1 : -1;
      let curr = startIdx;
      while (curr !== endIdx) {
        curr += step;
        route.push(curr);
      }
    }

    if (route.length === 0) {
      tl.to(p.position, { duration: 0.1, onComplete: () => {
        if (endIdx !== 2) nodes[endIdx].material = matNodeActive;
        const baseScale = endIdx === 2 ? 1.5 : 1;
        gsap.to(nodes[endIdx].scale, { x: baseScale + 0.5, y: baseScale + 0.5, z: baseScale + 0.5, duration: 0.2, yoyo: true, repeat: 1 });
      }});
      
      const distFromCenter = Math.abs(endIdx - 2); 
      const dynamicZoom = 10 + (distFromCenter * 2);
      tl.to(camera.position, {
        x: 0, y: 2, z: dynamicZoom,
        duration: 1.0, ease: 'power2.inOut',
        onUpdate: () => { const lt = camera.userData.lookTarget || {x:0,y:0,z:0}; camera.lookAt(lt.x, lt.y, lt.z); }
      }, "<");
      tl.to(camera.userData.lookTarget, {
        x: nPos[endIdx].x * 0.4, y: nPos[endIdx].y * 0.4, z: 0,
        duration: 1.0, ease: 'power2.inOut'
      }, "<");
    } else {
      route.forEach((toNode, rIdx) => {
        const isFinalNode = (toNode === endIdx);
        
        tl.to(p.position, {
          x: nPos[toNode].x, y: nPos[toNode].y, z: nPos[toNode].z,
          duration: 0.6, ease: 'power1.inOut',
          onComplete: () => {
            if (toNode !== 2) nodes[toNode].material = matNodeActive;
            const baseScale = toNode === 2 ? 1.5 : 1;
            gsap.to(nodes[toNode].scale, {
              x: baseScale + 0.5, y: baseScale + 0.5, z: baseScale + 0.5, 
              duration: 0.15, yoyo: true, repeat: 1,
              onComplete: () => {
                if (!isFinalNode && toNode !== 2) nodes[toNode].material = matNodeIdle;
              }
            });
          }
        });
        
        const distFromCenter = Math.abs(toNode - 2); 
        const dynamicZoom = 10 + (distFromCenter * 2);
        tl.to(camera.position, {
          x: 0, y: 2, z: dynamicZoom, 
          duration: 0.6, ease: 'power1.inOut',
          onUpdate: () => { const lt = camera.userData.lookTarget || {x:0,y:0,z:0}; camera.lookAt(lt.x, lt.y, lt.z); }
        }, "<"); 
        tl.to(camera.userData.lookTarget, {
          x: nPos[toNode].x * 0.4, y: nPos[toNode].y * 0.4, z: 0,
          duration: 0.6, ease: 'power1.inOut'
        }, "<");
      });
    }
  } else {
    gsap.killTweensOf(coreMesh.position);
    
    function createParticles(x, y, z, isDrop, hexColor, intensity = 1.0) {
      if (!isDrop) return;
      const particleCount = Math.max(4, Math.floor(12 * intensity));
      for (let j = 0; j < particleCount; j++) {
        const puff = particlePool[poolIdx];
        poolIdx = (poolIdx + 1) % particlePoolSize;
        
        gsap.killTweensOf(puff.position);
        gsap.killTweensOf(puff.rotation);
        gsap.killTweensOf(puff.material);
        gsap.killTweensOf(puff.scale);
        
        puff.visible = true;
        puff.material.color.setHex(hexColor);
        puff.material.opacity = 0.8;
        puff.position.set(x, y, z);
        puff.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        const scaleMult = 0.5 + Math.random() * intensity;
        puff.scale.set(scaleMult, scaleMult, scaleMult);
        
        gsap.to(puff.position, {
          x: x + (Math.random() - 0.5) * 4 * intensity,
          y: y + (Math.random() * 0.8) * intensity, 
          z: z + (Math.random() - 0.5) * 4 * intensity,
          duration: 0.4 + Math.random() * 0.3,
          ease: 'power2.out'
        });
        gsap.to(puff.rotation, { x: "+=3", y: "+=3", duration: 0.7 });
        gsap.to(puff.material, { opacity: 0, duration: 0.5 + Math.random() * 0.3, ease: 'power2.out' });
        gsap.to(puff.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.7, onComplete: () => {
          puff.visible = false;
        }});
      }
    }
    
    let virtualY = coreMesh.position.y;
    const tl = gsap.timeline();
    
    const queueMove = (targetY, color) => {
       if (Math.abs(virtualY - targetY) < 0.1) {
          tl.call(() => { coreMesh.material.color.setHex(color); })
            .to({}, { duration: 0.3 }); 
          return;
       }
       if (virtualY > targetY) {
          const dist = Math.abs(virtualY - targetY);
          const scale = Math.max(0.4, dist / 5.0); 
          tl.call(() => { coreMesh.material.color.setHex(color); })
            .to(coreMesh.position, { x: 0, y: targetY, z: 0, duration: 0.35, ease: 'power2.in' })
            .call(() => { createParticles(0, targetY, 0, true, color, 1.4 * scale); })
            .to(coreMesh.position, { y: targetY + 0.6 * scale, duration: 0.15, ease: 'power1.out' })
            .to(coreMesh.position, { y: targetY, duration: 0.15, ease: 'power1.in' })
            .call(() => { createParticles(0, targetY, 0, true, color, 0.7 * scale); })
            .to(coreMesh.position, { y: targetY + 0.2 * scale, duration: 0.1, ease: 'power1.out' })
            .to(coreMesh.position, { y: targetY, duration: 0.1, ease: 'power1.in' })
            .call(() => { createParticles(0, targetY, 0, true, color, 0.3 * scale); });
       } else {
          tl.call(() => { coreMesh.material.color.setHex(color); })
            .to(coreMesh.position, { x: 0, y: targetY, z: 0, duration: 0.8, ease: 'power3.inOut' });
       }
       virtualY = targetY;
    };

    if (i === 0) {
       if (virtualY < -1) queueMove(0, 0xf1c40f); 
       if (virtualY < 2) queueMove(2.5, 0x00E5FF); 
       queueMove(2.5, 0xffffff); 
    } else if (i === 1) {
       if (virtualY < -1) queueMove(0, 0xf1c40f); 
       queueMove(2.5, 0x00E5FF);
    } else if (i === 2) {
       if (virtualY > 1) queueMove(2.5, 0x00E5FF); 
       queueMove(0, 0xf1c40f);
    } else if (i === 3) {
       if (virtualY > 1) { queueMove(2.5, 0x00E5FF); queueMove(0, 0xf1c40f); }
       queueMove(-2.5, 0x2ecc71);   
    } else if (i === 4) {
       if (virtualY > 1) { queueMove(2.5, 0x00E5FF); queueMove(0, 0xf1c40f); }
       queueMove(-2.5, 0xff6b00); 
       tl.to(coreMesh.position, { y: -1.5, duration: 0.5, yoyo: true, repeat: -1, ease: 'power1.inOut' });
    }
    
    gsap.killTweensOf(camera.position);
    const lt = camera.userData.lookTarget || {x:0,y:0,z:0};
    gsap.to(lt, { x: 0, y: 0, z: 0, duration: 1.5, ease: 'power3.inOut' });
    gsap.to(camera.position, {
      x: 0, y: 0, z: 11, duration: 1.5, ease: 'power3.inOut',
      onUpdate: () => camera.lookAt(lt.x, lt.y, lt.z)
    });
  }
  
  lastActiveNodeIdx = i;
  lastActiveBtn = btn;
}

// Attach globally so flat UI works instantly
document.querySelectorAll('#rr-stage-list .stage-button').forEach((btn, i) => {
  btn.addEventListener('click', () => handleStageClick(btn, i, rrLogs));
});
document.querySelectorAll('#elms-stage-list .stage-button').forEach((btn, i) => {
  btn.addEventListener('click', () => handleStageClick(btn, i, elmsLogs));
});


// ========================================================
// ASYNC WEBGL BUNDLE LAZY LOADING (Point 5 Optimization)
// ========================================================
async function init3DScene() {
  if (window.is3DReady) return; // WebGL Debug Fix 4
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  const canvas = document.querySelector('#scene');
  if (!canvas) return;

  // Dynamically load Three.js ONLY after HTML/CSS flat UI paints
  let THREE;
  try {
    THREE = await import('three'); // WebGL Debug Fix 4
  } catch (err) {
    console.error("WebGL failed to load", err);
    return;
  }
  
  is3DReady = true;
  window.is3DReady = true;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07111d, 0.045);

  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(aspect < 1 ? 60 : 45, aspect, 0.1, 100); // WebGL Debug Fix 2

  camera.position.set(0, 5, 12);
  camera.lookAt(0, 0, 0);
  camera.userData.lookTarget = { x: 0, y: 0, z: 0 };

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.setClearColor(0x07111d, 1);

  group = new THREE.Group();
  scene.add(group);

  elmsGroup = new THREE.Group();
  scene.add(elmsGroup);
  if (activeProject === 'resumeradar') { elmsGroup.visible = false; } else { group.visible = false; }

  // ELMS Server Rack
  const bladeGeo = new THREE.BoxGeometry(3, 0.4, 2);
  const matAuth = new THREE.MeshBasicMaterial({ color: 0x3498db, wireframe: true, transparent: true, opacity: 0.6 });
  const matApprove = new THREE.MeshBasicMaterial({ color: 0x9b59b6, wireframe: true, transparent: true, opacity: 0.6 });
  const matDB = new THREE.MeshBasicMaterial({ color: 0x2ecc71, wireframe: true, transparent: true, opacity: 0.6 });
  
  const p1 = new THREE.Mesh(bladeGeo, matAuth); p1.position.set(0, 2.5, 0); elmsGroup.add(p1);
  const p2 = new THREE.Mesh(bladeGeo, matApprove); p2.position.set(0, 0, 0); elmsGroup.add(p2);
  const p3 = new THREE.Mesh(bladeGeo, matDB); p3.position.set(0, -2.5, 0); elmsGroup.add(p3);
  elmsLayers.push(p1, p2, p3);

  const pipeGeo1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 2.5, 0), new THREE.Vector3(-1, 0, 0)]);
  const pipeGeo2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, -2.5, 0)]);

  const payloadGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  coreMesh = new THREE.Mesh(payloadGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  coreMesh.position.set(0, 2.5, 0);
  elmsGroup.add(coreMesh);

  matNodeActive = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 1.0 });
  matNodeIdle = new THREE.MeshBasicMaterial({ color: 0x3498db, wireframe: true, transparent: true, opacity: 0.6 });
  matCore = new THREE.MeshBasicMaterial({ color: 0x00E676, wireframe: true, transparent: true, opacity: 0.9 });
  matEdge = new THREE.LineBasicMaterial({ color: 0x00E5FF, transparent: true, opacity: 0.35 });

  elmsGroup.add(new THREE.Line(pipeGeo1, matEdge));
  elmsGroup.add(new THREE.Line(pipeGeo2, matEdge));

  window.updateThreeTheme();

  nPos = [
    new THREE.Vector3(-4, 1.5, -2),
    new THREE.Vector3(-2, 0, 1),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(3, 2, -1),
    new THREE.Vector3(2, -1, 2)
  ];

  const geoNode = new THREE.IcosahedronGeometry(0.5, 1);
  nPos.forEach((pos, i) => {
    const mesh = new THREE.Mesh(geoNode, i === 2 ? matCore : matNodeIdle);
    if (i === 2) mesh.scale.set(1.5, 1.5, 1.5);
    mesh.position.copy(pos);
    group.add(mesh);
    nodes.push(mesh);
  });

  const geoLine = new THREE.BufferGeometry().setFromPoints(nPos);
  group.add(new THREE.Line(geoLine, matEdge));

  const pGeo = new THREE.SphereGeometry(0.22, 12, 12);
  for (let i = 0; i < 3; i++) {
    const pMat = new THREE.MeshBasicMaterial({ color: 0x00E5FF, fog: false });
    const p = new THREE.Mesh(pGeo, pMat);
    p.visible = false;
    group.add(p);
    particles.push(p);
  }

  // OBJECT POOL FOR ELMS (Garbage Collection Fix)
  const cloudGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  for (let i = 0; i < particlePoolSize; i++) {
     const puff = new THREE.Mesh(cloudGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
     puff.visible = false;
     elmsGroup.add(puff);
     particlePool.push(puff);
  }

  // RENDER THROTTLER (Battery Drain Fix)
  let isTabActive = !document.hidden;
  let isCanvasVisible = true;
  let isRendering = true;

  const updateRenderState = () => {
    isRendering = isTabActive && isCanvasVisible;
  };

  document.addEventListener('visibilitychange', () => { 
    isTabActive = !document.hidden; 
    updateRenderState();
  });
  
  const sceneObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => { isCanvasVisible = entry.isIntersecting; });
    updateRenderState();
  }, { threshold: 0.01 });
  sceneObserver.observe(canvas);

  const scratchColor = new THREE.Color(); // Memory Debug Fix 1

  function animate() {
    requestAnimationFrame(animate);
    if (!isRendering) return; // Throttle when out of view

    group.rotation.y += 0.002;
    nodes[2].rotation.x += 0.01;
    nodes[2].rotation.y += 0.01;
    
    if (elmsGroup && elmsGroup.visible) {
      elmsGroup.rotation.y = Math.sin(Date.now() * 0.0005) * 0.2;
      coreMesh.rotation.x += 0.02;
      coreMesh.rotation.y += 0.02;
      
      const checkGlow = (blade, targetY, defaultColor) => {
        if (!blade) return;
        const dist = Math.abs(coreMesh.position.y - targetY);
        const intensity = Math.max(0, 1 - (dist / 1.0));
        
        if (intensity > 0) {
          scratchColor.setHex(defaultColor);
          scratchColor.lerp(coreMesh.material.color, intensity * 0.7);
          blade.material.color.copy(scratchColor);
          blade.material.opacity = 0.6 + (intensity * 0.4);
          const s = 1.0 + (intensity * 0.1);
          blade.scale.set(s, s, s);
        } else {
          blade.material.color.setHex(defaultColor);
          blade.material.opacity = 0.6;
          blade.scale.set(1, 1, 1);
        }
      };
      
      checkGlow(elmsLayers[0], 2.5, 0x3498db);
      checkGlow(elmsLayers[1], 0, 0x9b59b6);
      checkGlow(elmsLayers[2], -2.5, 0x2ecc71);
    }
    renderer.render(scene, camera);
  }
  animate();

  // FRUSTUM RESIZE FIX
  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    
    const aspect = width / height;
    camera.aspect = aspect;
    camera.fov = aspect < 1 ? 60 : 45; // Widen FOV on mobile
    camera.updateProjectionMatrix();
  });
}

// Trigger Lazy Load after DOM mounts
document.addEventListener('DOMContentLoaded', () => {
  // Add a slight delay to ensure UI parses and paints first
  setTimeout(() => {
    init3DScene();
  }, 100);
});
