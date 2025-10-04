(() => {
  const PLAYER = {
    eyeHeight: 1.65,
    walkSpeed: 3,
    runSpeed: 6,
    accel: 100,
    airAccel: 12,
    friction: 0.92,
    jumpPower: 10,
    jumpBoost: 1.05,
    gravity: -40,
    maxHSpeed: 100,
    coyoteTime: 0.25,
    jumpBuffer: 0.2
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
  scene.add(hemiLight);
  const sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
  scene.add(sunLight);

  const sky = new THREE.Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);

  const skyU = sky.material.uniforms;
  skyU['turbidity'].value = 10;
  skyU['rayleigh'].value = 2;
  skyU['mieCoefficient'].value = 0.005;
  skyU['mieDirectionalG'].value = 0.8;

  const sun = new THREE.Vector3();
  let timeOfDay = 0;

  const texLoader = new THREE.TextureLoader();
  const groundTex = texLoader.load("https://threejs.org/examples/textures/checker.png");
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(200,200);
  groundTex.magFilter = THREE.NearestFilter;
  groundTex.minFilter = THREE.NearestFilter;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000,2000),
    new THREE.MeshStandardMaterial({ map: groundTex, side: THREE.DoubleSide })
  );
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);
  const objects = [ground];

  const player = {
    pos: new THREE.Vector3(0, PLAYER.eyeHeight, 0),
    vel: new THREE.Vector3(),
    explosionVel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    grounded: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    runCap: PLAYER.runSpeed
  };

  function updateCamera() {
    camera.position.copy(player.pos);
    camera.rotation.set(player.pitch, player.yaw, 0, "ZYX");
  }

  const keys = {};
  const keyMap = {
    'KeyW': 'forward', 'ArrowUp': 'forward',
    'KeyS': 'back', 'ArrowDown': 'back',
    'KeyA': 'left', 'ArrowLeft': 'left',
    'KeyD': 'right', 'ArrowRight': 'right',
    'ShiftLeft': 'run', 'ShiftRight': 'run',
    'Space': 'jump'
  };

  addEventListener('keydown', e => {
    if(keyMap[e.code]) {
      keys[keyMap[e.code]] = true;
      e.preventDefault();
      if(keyMap[e.code] === 'jump') player.jumpBufferTimer = PLAYER.jumpBuffer;
    }
  });

  addEventListener('keyup', e => {
    if(keyMap[e.code]) keys[keyMap[e.code]] = false;
  });

  // Pointer lock
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  startBtn.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
    overlay.style.display = 'none';
  });

  document.addEventListener('pointerlockchange', () => {
    if(document.pointerLockElement === renderer.domElement) requestAnimationFrame(animate);
  });

  document.addEventListener('mousemove', e => {
    if(document.pointerLockElement !== renderer.domElement) return;
    const sens = 0.0022;
    player.yaw -= e.movementX * sens;
    player.pitch -= e.movementY * sens;
    player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
  });

  const tracker = document.getElementById('tracker');

  function getCameraDir() {
    const f = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
    const s = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const dir = new THREE.Vector3(s, 0, -f);
    if(dir.lengthSq() === 0) return dir;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0,1,0), player.yaw);
    return dir;
  }

  const explosions = [];
  addEventListener('mousedown', () => {
    const forward = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    const expPoint = player.pos.clone().add(forward.clone().multiplyScalar(5));
    explosions.push({ pos: expPoint, time: 0 });
  });

  function applyExplosions(dt) {
    for(let i = explosions.length - 1; i >= 0; i--) {
      const ex = explosions[i];
      const diff = player.pos.clone().sub(ex.pos);
      const dist = diff.length();
      if(dist < 50) {
        const force = (50 - dist)/50*120;
        diff.normalize();
        player.explosionVel.add(diff.multiplyScalar(force*dt));
      }
      ex.time += dt;
      if(ex.time > 0.5) explosions.splice(i, 1);
    }
  }

  function updateSky(dt) {
    timeOfDay += dt * 60;
    if(timeOfDay > 360) timeOfDay -= 360;
    const phi = THREE.MathUtils.degToRad(90 - (Math.sin(timeOfDay*Math.PI/180)*90));
    const theta = THREE.MathUtils.degToRad(timeOfDay);
    sun.setFromSphericalCoords(1, phi, theta);
    skyU['sunPosition'].value.copy(sun);
    sunLight.position.copy(sun).multiplyScalar(50);
    const brightness = Math.max(0, sun.y);
    sunLight.intensity = 0.6*brightness;
    hemiLight.intensity = 0.2 + 0.5*brightness;
  }

  let prevTime = performance.now()/1000;

  function animate() {
    const now = performance.now()/1000;
    const dt = Math.min(0.1, now - prevTime);
    prevTime = now;
    requestAnimationFrame(animate);

    if(player.grounded) player.coyoteTimer = PLAYER.coyoteTime; else player.coyoteTimer -= dt;
    if(player.jumpBufferTimer > 0) player.jumpBufferTimer -= dt;

    const dir = getCameraDir();
    let hVel = new THREE.Vector3(player.vel.x, 0, player.vel.z);
    let currentSpeed = hVel.length();
    const targetSpeed = (keys.run ? player.runCap : PLAYER.walkSpeed);

    if(dir.lengthSq() > 0) {
      const accel = player.grounded ? PLAYER.accel : PLAYER.airAccel;
      hVel.addScaledVector(dir, accel * dt);
      if(hVel.length() > targetSpeed && currentSpeed <= player.runCap) hVel.setLength(targetSpeed);
      currentSpeed = hVel.length();
      hVel.copy(dir.clone().multiplyScalar(currentSpeed));
    } else if(player.grounded) {
      hVel.multiplyScalar(PLAYER.friction);
    }

    player.vel.x = hVel.x + player.explosionVel.x;
    player.vel.z = hVel.z + player.explosionVel.z;
    player.vel.y += PLAYER.gravity * dt;

    if(player.jumpBufferTimer > 0 && (player.grounded || player.coyoteTimer > 0)) {
      player.grounded = false;
      player.jumpBufferTimer = 0;
      const hv = new THREE.Vector3(player.vel.x, 0, player.vel.z).multiplyScalar(PLAYER.jumpBoost);
      player.vel.x = hv.x + player.explosionVel.x;
      player.vel.z = hv.z + player.explosionVel.z;
      const hSpeed = Math.sqrt(player.vel.x**2 + player.vel.z**2);
      const flatten = Math.min(hSpeed*0.08, PLAYER.jumpPower*0.6);
      player.vel.y = PLAYER.jumpPower - flatten;
      player.runCap *= PLAYER.jumpBoost;
    }

    player.pos.addScaledVector(player.vel, dt);

    if(player.pos.y < PLAYER.eyeHeight) {
      player.pos.y = PLAYER.eyeHeight;
      player.vel.y = 0;
      player.grounded = true;
    } else player.grounded = false;

    let hSpeed = Math.sqrt(player.vel.x**2 + player.vel.z**2);
    if(hSpeed > PLAYER.maxHSpeed) {
      player.vel.x = player.vel.x / hSpeed * PLAYER.maxHSpeed;
      player.vel.z = player.vel.z / hSpeed * PLAYER.maxHSpeed;
      hSpeed = PLAYER.maxHSpeed;
    }
    if(hSpeed <= PLAYER.walkSpeed - 0.5) {
      player.vel.x = 0;
      player.vel.z = 0;
      hSpeed = 0;
      player.runCap = PLAYER.runSpeed;
    }

    player.explosionVel.multiplyScalar(0.92);

    // Wraparound
    const limit = 1000;
    if(player.pos.x > limit) player.pos.x = -limit;
    if(player.pos.x < -limit) player.pos.x = limit;
    if(player.pos.z > limit) player.pos.z = -limit;
    if(player.pos.z < -limit) player.pos.z = limit;

    applyExplosions(dt);
    updateCamera();
    updateSky(dt);

    tracker.textContent = `X:${player.pos.x.toFixed(2)} Y:${player.pos.y.toFixed(2)} Z:${player.pos.z.toFixed(2)}\nSpeed:${hSpeed.toFixed(2)} RunCap:${player.runCap.toFixed(2)}`;
    renderer.render(scene, camera);
  }

  animate();

  addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();
