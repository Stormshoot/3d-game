(() => {
  const PLAYER = {
    eyeHeight: 1.65,
    walkSpeed: 3,
    runSpeed: 6,
    accel: 25,
    airAccel: 8,
    friction: 0.92,
    jumpPower: 5,
    jumpBoost: 1.05,
    gravity: -9.81,
    coyoteTime: 0.25,
    jumpBuffer: 0.25
  };

  const WORLD_SIZE = 2000; // world wrap size

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88ccff);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(5, 10, 5);
  scene.add(sun);

  // Ground texture
  const texLoader = new THREE.TextureLoader();
  const groundTex = texLoader.load("https://threejs.org/examples/textures/checker.png");
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(400, 400);
  groundTex.magFilter = THREE.NearestFilter;
  groundTex.minFilter = THREE.NearestFilter;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    new THREE.MeshStandardMaterial({ map: groundTex, side: THREE.DoubleSide })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Player state
  const player = {
    pos: new THREE.Vector3(0, PLAYER.eyeHeight, 0),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    grounded: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0
  };

  function updateCamera() {
    camera.position.copy(player.pos);
    camera.rotation.set(player.pitch, player.yaw, 0, "ZYX");
  }

  // Input
  const keys = {};
  const keyMap = {
    'KeyW': 'forward', 'ArrowUp': 'forward',
    'KeyS': 'back', 'ArrowDown': 'back',
    'KeyA': 'left', 'ArrowLeft': 'left',
    'KeyD': 'right', 'ArrowRight': 'right',
    'ShiftLeft': 'run', 'ShiftRight': 'run',
    'Space': 'jump',
    'KeyP': 'toggleLine'
  };
  addEventListener('keydown', e => {
    if (keyMap[e.code]) {
      keys[keyMap[e.code]] = true;
      e.preventDefault();

      if (keyMap[e.code] === 'jump') player.jumpBufferTimer = PLAYER.jumpBuffer;
      if (keyMap[e.code] === 'toggleLine') {
        crossLine.visible = !crossLine.visible;
      }
    }
  });
  addEventListener('keyup', e => { if (keyMap[e.code]) keys[keyMap[e.code]] = false; });

  // Pointer lock
  const overlay = document.getElementById('overlay');
  document.getElementById('startBtn').addEventListener('click', () => renderer.domElement.requestPointerLock());
  document.addEventListener('pointerlockchange', () => overlay.style.display = (document.pointerLockElement === renderer.domElement) ? 'none' : '');
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== renderer.domElement) return;
    const sens = 0.0022;
    player.yaw -= e.movementX * sens;
    player.pitch -= e.movementY * sens;
    player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
  });

  // Movement direction relative to camera
  function getMoveDir() {
    const f = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
    const s = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const dir = new THREE.Vector3(s, 0, -f);
    if (dir.lengthSq() === 0) return dir;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
    return dir;
  }

  // Explosions
  const objects = [ground];
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(0, 0);
  const explosions = [];

  document.addEventListener('mousedown', () => {
    if (document.pointerLockElement !== renderer.domElement) return;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(objects);
    if (hits.length > 0) {
      const point = hits[0].point.clone();

      // Explosion sphere visual
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.25 })
      );
      sphere.position.copy(point);
      scene.add(sphere);
      explosions.push({ mesh: sphere, time: 0 });

      // Spherical knockback with speed scaling
      const toPlayer = player.pos.clone().sub(point);
      const dist = Math.max(0.5, toPlayer.length());
      toPlayer.normalize();

      const power = 120;
      const force = toPlayer.multiplyScalar(power / dist);
      player.vel.add(force);

      // scale jump arc with new hSpeed
      const hVel = new THREE.Vector3(player.vel.x, 0, player.vel.z);
      const hSpeed = hVel.length();
      if (!player.grounded) {
        player.vel.y = PLAYER.jumpPower - Math.min(hSpeed * 0.08, PLAYER.jumpPower * 0.6);
      }
    }
  });

  // Crosshair helper line
  const crossMat = new THREE.LineBasicMaterial({ color: 0xffff00 });
  const crossGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -100)
  ]);
  const crossLine = new THREE.Line(crossGeo, crossMat);
  camera.add(crossLine);
  crossLine.visible = false;
  scene.add(camera);

  // HUD XYZ tracker
  const hud = document.createElement('div');
  hud.style.position = 'fixed';
  hud.style.top = '10px';
  hud.style.left = '10px';
  hud.style.color = 'white';
  hud.style.fontFamily = 'monospace';
  hud.style.fontSize = '16px';
  hud.style.background = 'rgba(0,0,0,0.5)';
  hud.style.padding = '4px 8px';
  hud.style.borderRadius = '4px';
  document.body.appendChild(hud);

  // Main loop
  let prev = performance.now() / 1000;
  function animate() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - prev);
    prev = now;

    const dir = getMoveDir();
    const hVel = new THREE.Vector3(player.vel.x, 0, player.vel.z);
    const hSpeed = hVel.length();
    const maxSpeed = (keys.run ? PLAYER.runSpeed : PLAYER.walkSpeed);

    // Ground vs air movement
    if (player.grounded) {
      if (dir.lengthSq() > 0) {
        const desired = dir.multiplyScalar(maxSpeed);
        hVel.lerp(desired, 1 - Math.exp(-PLAYER.accel * dt));
      } else {
        hVel.multiplyScalar(PLAYER.friction);
      }
    } else {
      if (dir.lengthSq() > 0) {
        hVel.add(dir.multiplyScalar(PLAYER.airAccel * dt));
      }
    }
    player.vel.x = hVel.x;
    player.vel.z = hVel.z;

    // Coyote time & jump buffer
    if (player.grounded) {
      player.coyoteTimer = PLAYER.coyoteTime;
    } else {
      player.coyoteTimer -= dt;
    }
    player.jumpBufferTimer -= dt;
    if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
      player.vel.y = PLAYER.jumpPower - Math.min(hSpeed * 0.08, PLAYER.jumpPower * 0.6);
      player.grounded = false;
      player.jumpBufferTimer = 0;
    }

    // Gravity
    player.vel.y += PLAYER.gravity * dt;

    // Update position
    player.pos.addScaledVector(player.vel, dt);

    // World wrap
    if (player.pos.x > WORLD_SIZE / 2) player.pos.x -= WORLD_SIZE;
    if (player.pos.x < -WORLD_SIZE / 2) player.pos.x += WORLD_SIZE;
    if (player.pos.z > WORLD_SIZE / 2) player.pos.z -= WORLD_SIZE;
    if (player.pos.z < -WORLD_SIZE / 2) player.pos.z += WORLD_SIZE;

    // Ground collision
    if (player.pos.y < PLAYER.eyeHeight) {
      player.pos.y = PLAYER.eyeHeight;
      player.vel.y = 0;
      player.grounded = true;
    }

    // Explosion visuals update
    for (let i = explosions.length - 1; i >= 0; i--) {
      const e = explosions[i];
      e.time += dt;

      const progress = e.time / 0.5;
      e.mesh.scale.setScalar(1 + progress * 10);
      e.mesh.material.opacity = Math.max(0, 0.25 * (1 - progress));

      if (e.time > 0.5) {
        scene.remove(e.mesh);
        explosions.splice(i, 1);
      }
    }

    updateCamera();
    hud.textContent = `X:${player.pos.x.toFixed(2)} Y:${player.pos.y.toFixed(2)} Z:${player.pos.z.toFixed(2)}`;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
})();
