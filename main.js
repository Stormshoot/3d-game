// main.js
// Minimal first-person room with collision using Three.js (CDN).
// Drop index.html, style.css, main.js in the repo root and enable GitHub Pages.

(() => {
  const ROOM = { width: 12, depth: 18, height: 4.2 }; // interior dimensions (meters)
  const PLAYER = {
    radius: 0.28,      // collision radius (meters)
    eyeHeight: 1.65,   // camera height from floor when standing
    speedWalk: 2.2,
    speedRun: 5.0,
    accel: 20,
    decel: 20,
    jumpSpeed: 5.0
  };

  // Scene / renderer / camera
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222233);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  document.body.appendChild(renderer.domElement);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
  hemi.position.set(0, ROOM.height, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 10, 5);
  scene.add(dir);

  // Room (inward-facing box)
  const roomGroup = new THREE.Group();
  const halfW = ROOM.width/2, halfD = ROOM.depth/2, halfH = ROOM.height/2;

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x808080 });
  const wallMat  = new THREE.MeshStandardMaterial({ color: 0x2f6f8f });
  const ceilMat  = new THREE.MeshStandardMaterial({ color: 0x4b4b6b });

  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), floorMat);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = -halfH;
  scene.add(floor);

  // Ceiling
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), ceilMat);
  ceiling.rotation.x = Math.PI/2;
  ceiling.position.y = halfH;
  scene.add(ceiling);

  // Walls (4)
  const wallGeoA = new THREE.PlaneGeometry(ROOM.width, ROOM.height);
  const wallGeoB = new THREE.PlaneGeometry(ROOM.depth, ROOM.height);

  const wallFront = new THREE.Mesh(wallGeoA, wallMat);
  wallFront.position.z = -halfD;
  wallFront.position.y = 0;
  wallFront.rotation.y = Math.PI;
  scene.add(wallFront);

  const wallBack = new THREE.Mesh(wallGeoA, wallMat);
  wallBack.position.z = halfD;
  wallBack.position.y = 0;
  scene.add(wallBack);

  const wallLeft = new THREE.Mesh(wallGeoB, wallMat);
  wallLeft.position.x = -halfW;
  wallLeft.position.y = 0;
  wallLeft.rotation.y = Math.PI/2;
  scene.add(wallLeft);

  const wallRight = new THREE.Mesh(wallGeoB, wallMat);
  wallRight.position.x = halfW;
  wallRight.position.y = 0;
  wallRight.rotation.y = -Math.PI/2;
  scene.add(wallRight);

  // Some decorative objects so you don't cry into the corner
  const box = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({color:0xff8a65}));
  box.position.set(2, -halfH + 0.5, -2);
  scene.add(box);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,ROOM.height-0.4,16), new THREE.MeshStandardMaterial({color:0x8ad3ff}));
  pillar.position.set(-2, 0, 3);
  scene.add(pillar);

  // Player state (not a visible model; camera represents eyes)
  const player = {
    pos: new THREE.Vector3(0, -halfH + PLAYER.eyeHeight, 0),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0, // horizontal rotation
    pitch: 0, // vertical rotation
    grounded: false
  };

  // Attach camera to player
  function updateCamera() {
    camera.position.copy(player.pos);
    camera.rotation.set(player.pitch, player.yaw, 0, "ZYX");
  }
  updateCamera();

  // Input
  const keys = { forward:0, back:0, left:0, right:0, run:0, jump:0 };
  const keyMap = {
    'KeyW': 'forward',
    'ArrowUp': 'forward',
    'KeyS': 'back',
    'ArrowDown': 'back',
    'KeyA': 'left',
    'ArrowLeft': 'left',
    'KeyD': 'right',
    'ArrowRight': 'right',
    'ShiftLeft': 'run',
    'ShiftRight': 'run',
    'Space': 'jump'
  };

  window.addEventListener('keydown', (e) => {
    const k = keyMap[e.code];
    if (k) {
      if (k === 'jump') keys.jump = 1;
      else keys[k] = 1;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = keyMap[e.code];
    if (k) {
      if (k === 'jump') keys.jump = 0;
      else keys[k] = 0;
      e.preventDefault();
    }
  });

  // Pointer lock + mouse look
  const startBtn = document.getElementById('startBtn');
  const overlay = document.getElementById('overlay');
  startBtn.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === renderer.domElement;
    overlay.style.display = locked ? 'none' : '';
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    const sensitivity = 0.0022;
    player.yaw -= e.movementX * sensitivity;
    player.pitch -= e.movementY * sensitivity;
    // clamp pitch
    const maxPitch = Math.PI/2 - 0.01;
    player.pitch = Math.max(-maxPitch, Math.min(maxPitch, player.pitch));
  });

  // Simple physics constants
  const gravity = -9.81;
  const floorY = -halfH;
  const ceilingY = halfH;

  // Movement helpers
  function getMoveDirectionVector() {
    const dir = new THREE.Vector3();
    const forward = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
    const strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (forward === 0 && strafe === 0) return dir;
    dir.set(strafe, 0, forward).normalize();
    // rotate by yaw
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    const x = dir.x * cos - dir.z * sin;
    const z = dir.x * sin + dir.z * cos;
    dir.set(x, 0, z);
    return dir;
  }

  // Prevent camera from going through walls: clamp pos to inside room minus player.radius.
  function collideAgainstRoom(pos) {
    const r = PLAYER.radius;
    const minX = -halfW + r;
    const maxX = halfW - r;
    const minZ = -halfD + r;
    const maxZ = halfD - r;
    // clamp X,Z
    pos.x = Math.max(minX, Math.min(maxX, pos.x));
    pos.z = Math.max(minZ, Math.min(maxZ, pos.z));
    // clamp Y between floor + small offset and ceiling - eye height margin
    const minY = floorY + PLAYER.eyeHeight; // player's eye height naturally sits above floor when grounded
    const maxY = ceilingY - 0.1;
    pos.y = Math.max(minY - 5, Math.min(maxY, pos.y)); // allow falling through slightly but not above ceiling
  }

  // Animation loop
  let prevTime = performance.now() / 1000;
  function animate() {
    const time = performance.now() / 1000;
    let dt = time - prevTime;
    prevTime = time;
    // clamp dt to avoid teleport when dev tools cause lag
    if (dt > 0.1) dt = 0.1;

    // Horizontal movement
    const wishDir = getMoveDirectionVector();
    const running = !!keys.run;
    const targetSpeed = (running ? PLAYER.speedRun : PLAYER.speedWalk) * (wishDir.length() ? 1 : 0);
    const currentVelFlat = new THREE.Vector3(player.vel.x, 0, player.vel.z);
    // accelerate toward target velocity on wishDir
    if (wishDir.length() > 0) {
      const desired = wishDir.multiplyScalar(targetSpeed);
      // accelerate
      currentVelFlat.lerp(desired, 1 - Math.exp(-PLAYER.accel * dt));
    } else {
      // decelerate to zero
      currentVelFlat.lerp(new THREE.Vector3(0,0,0), 1 - Math.exp(-PLAYER.decel * dt));
    }
    player.vel.x = currentVelFlat.x;
    player.vel.z = currentVelFlat.z;

    // Vertical physics (gravity + jump)
    player.vel.y += gravity * dt;
    // jump if requested and grounded
    if (keys.jump && player.grounded) {
      player.vel.y = PLAYER.jumpSpeed;
      player.grounded = false;
    }

    // integrate
    player.pos.addScaledVector(player.vel, dt);

    // basic floor collision
    const minEyeY = floorY + PLAYER.eyeHeight;
    if (player.pos.y <= minEyeY) {
      player.pos.y = minEyeY;
      player.vel.y = 0;
      player.grounded = true;
    } else {
      player.grounded = false;
    }

    // simple wall collision clamp
    collideAgainstRoom(player.pos);

    // camera eye height is player.pos (we already used eyeHeight in pos y)
    updateCamera();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // A tiny instruction when pointer lock is not active: click canvas to start
  renderer.domElement.style.cursor = 'crosshair';

  // Expose some globals for debugging from the console if you like fussing at it
  window.__tinyRoom = { scene, camera, player, ROOM, PLAYER };
})();
