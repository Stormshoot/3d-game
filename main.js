(() => {
  const PLAYER = {
    eyeHeight: 1.65,
    walkSpeed: 3,
    runSpeed: 6,
    accel: 25,
    airAccel: 12,
    friction: 0.92,
    jumpPower: 5,
    jumpBoost: 1.05,
    gravity: -9.81,
    maxHSpeed: 100,
    coyoteTime: 0.25,
    jumpBuffer: 0.2
  };

  // Scene and renderer
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88ccff);
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(5,10,5);
  scene.add(sun);

  // Ground (checkerboard) with slight mipmap
  const texLoader = new THREE.TextureLoader();
  const groundTex = texLoader.load("https://threejs.org/examples/textures/checker.png");
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(200,200);
  groundTex.magFilter = THREE.NearestFilter;
  groundTex.minFilter = THREE.LinearMipMapLinearFilter;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000,2000),
    new THREE.MeshStandardMaterial({ map: groundTex, side: THREE.DoubleSide })
  );
  ground.rotation.x = -Math.PI/2;
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

  function updateCamera(){
    camera.position.copy(player.pos);
    camera.rotation.set(player.pitch, player.yaw, 0, "ZYX");
  }

  // Input
  const keys = {};
  const keyMap = {
    'KeyW':'forward','ArrowUp':'forward',
    'KeyS':'back','ArrowDown':'back',
    'KeyA':'left','ArrowLeft':'left',
    'KeyD':'right','ArrowRight':'right',
    'ShiftLeft':'run','ShiftRight':'run',
    'Space':'jump'
  };

  addEventListener('keydown', e => {
    if(keyMap[e.code]){
      keys[keyMap[e.code]] = true;
      e.preventDefault();
      if(keyMap[e.code]==='jump'){
        player.jumpBufferTimer = PLAYER.jumpBuffer;
      }
    }
  });

  addEventListener('keyup', e => { if(keyMap[e.code]) keys[keyMap[e.code]] = false; });

  // Pointer lock
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  startBtn.addEventListener('click', ()=>renderer.domElement.requestPointerLock());
  document.addEventListener('pointerlockchange', ()=>{
    overlay.style.display = (document.pointerLockElement===renderer.domElement)?'none':'';
    if(document.pointerLockElement===renderer.domElement) requestAnimationFrame(animate);
  });
  document.addEventListener('mousemove', e => {
    if(document.pointerLockElement!==renderer.domElement) return;
    const sens = 0.0022;
    player.yaw -= e.movementX*sens;
    player.pitch -= e.movementY*sens;
    player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
  });

  // Debug tracker
  const tracker = document.createElement('div');
  tracker.style.position = 'absolute';
  tracker.style.top = '10px';
  tracker.style.left = '10px';
  tracker.style.color = '#fff';
  tracker.style.background = 'rgba(0,0,0,0.5)';
  tracker.style.padding = '6px';
  tracker.style.fontFamily = 'monospace';
  tracker.style.whiteSpace = 'pre';
  document.body.appendChild(tracker);

  // Helper: camera-relative input direction
  function getCameraDir(){
    const f = (keys.forward?1:0) - (keys.back?1:0);
    const s = (keys.right?1:0) - (keys.left?1:0);
    const dir = new THREE.Vector3(s,0,-f);
    if(dir.lengthSq()===0) return dir;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0,1,0), player.yaw);
    return dir;
  }

  let prevTime = performance.now()/1000;
  function animate(){
    const now = performance.now()/1000;
    const dt = Math.min(0.1, now-prevTime);
    prevTime = now;

    const dir = getCameraDir();
    const targetSpeed = (keys.run ? PLAYER.runSpeed : PLAYER.walkSpeed);

    // Timers
    if(player.grounded) player.coyoteTimer = PLAYER.coyoteTime;
    else player.coyoteTimer -= dt;
    if(player.jumpBufferTimer > 0) player.jumpBufferTimer -= dt;

    // HORIZONTAL VELOCITY — camera-aligned but respecting run/walk target
    const hVel = new THREE.Vector3(player.vel.x, 0, player.vel.z);
    let currentSpeed = hVel.length();

    if(dir.lengthSq() > 0){
      if(currentSpeed < 1e-4){
        // starting from (near) rest: jump to targetSpeed in camera dir
        hVel.copy(dir.clone().multiplyScalar(targetSpeed));
        currentSpeed = targetSpeed;
      } else if(currentSpeed < targetSpeed){
        // accelerate toward camera direction (increase speed up to target)
        // accel depends on ground/air
        const accel = player.grounded ? PLAYER.accel : PLAYER.airAccel;
        hVel.addScaledVector(dir, accel * dt);
        // clamp speed to targetSpeed
        if(hVel.length() > targetSpeed) hVel.setLength(targetSpeed);
        currentSpeed = hVel.length();
        // snap direction toward camera while preserving speed magnitude (so turns are sharp)
        hVel.setLength(currentSpeed);
        hVel.copy(dir.clone().multiplyScalar(currentSpeed));
      } else {
        // moving faster than target: keep magnitude but align direction instantly to camera
        hVel.copy(dir.clone().multiplyScalar(currentSpeed));
      }
    } else {
      // no input: keep hVel; friction will apply if grounded
    }

    // Friction when on ground
    if(player.grounded){
      hVel.multiplyScalar(PLAYER.friction);
    }

    // assign back
    player.vel.x = hVel.x;
    player.vel.z = hVel.z;

    // Gravity
    player.vel.y += PLAYER.gravity * dt;

    // JUMP (buffer + coyote). Preserve horizontal momentum and apply boost.
    if(player.jumpBufferTimer > 0 && (player.grounded || player.coyoteTimer > 0)){
      player.grounded = false;
      player.jumpBufferTimer = 0;

      // horizontal boost (vector scale — preserves direction)
      const hv = new THREE.Vector3(player.vel.x, 0, player.vel.z).multiplyScalar(PLAYER.jumpBoost);
      player.vel.x = hv.x;
      player.vel.z = hv.z;

      // scale jump arc with horizontal speed (flatten as speed increases)
      const hSpeed = Math.sqrt(player.vel.x*player.vel.x + player.vel.z*player.vel.z);
      const flatten = Math.min(hSpeed * 0.08, PLAYER.jumpPower * 0.6); // tweakable
      player.vel.y = PLAYER.jumpPower - flatten;
    }

    // Update position
    player.pos.addScaledVector(player.vel, dt);

    // Ground collision
    if(player.pos.y < PLAYER.eyeHeight){
      player.pos.y = PLAYER.eyeHeight;
      player.vel.y = 0;
      player.grounded = true;
    } else player.grounded = false;

    // Horizontal speed cap
    let hSpeed = Math.sqrt(player.vel.x*player.vel.x + player.vel.z*player.vel.z);
    if(hSpeed > PLAYER.maxHSpeed){
      player.vel.x = (player.vel.x / hSpeed) * PLAYER.maxHSpeed;
      player.vel.z = (player.vel.z / hSpeed) * PLAYER.maxHSpeed;
      hSpeed = PLAYER.maxHSpeed;
    }

    // Speed reset if very slow
    if(hSpeed <= PLAYER.walkSpeed - 0.5){
      player.vel.x = 0;
      player.vel.z = 0;
      hSpeed = 0;
    }

    // Update camera and tracker
    updateCamera();
    tracker.textContent = `X: ${player.pos.x.toFixed(2)}  Y: ${player.pos.y.toFixed(2)}  Z: ${player.pos.z.toFixed(2)}\nSpeed: ${hSpeed.toFixed(2)}  (run=${keys.run?1:0})`;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
})();
