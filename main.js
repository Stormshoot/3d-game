(() => {
  const PLAYER = {
    eyeHeight: 1.65,
    walkSpeed: 3,
    runSpeed: 6,
    accel: 25,
    decel: 12,
    jumpBoost: 1.05,  // horizontal velocity multiplier on jump
    jumpPower: 5,     // vertical jump velocity
    friction: 0.92,   // slows horizontal velocity
    gravity: -9.81
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88ccff);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(5, 10, 5);
  scene.add(sun);

  // Textured ground plane (checkerboard, sharp)
  const texLoader = new THREE.TextureLoader();
  const groundTex = texLoader.load("https://threejs.org/examples/textures/checker.png");
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(200, 200);
  groundTex.magFilter = THREE.NearestFilter;  // prevent blur
  groundTex.minFilter = THREE.NearestFilter;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ map: groundTex, side: THREE.DoubleSide })
  );
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);

  // Player
  const player = {
    pos: new THREE.Vector3(0, PLAYER.eyeHeight, 0),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    grounded: true
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
      if(keyMap[e.code]==='jump' && player.grounded){
        // Apply horizontal boost
        const horizontalVel = player.vel.clone();
        horizontalVel.y = 0;
        horizontalVel.multiplyScalar(PLAYER.jumpBoost);
        player.vel.x = horizontalVel.x;
        player.vel.z = horizontalVel.z;

        // Vertical jump
        player.vel.y = PLAYER.jumpPower;
        player.grounded = false;
      }
    }
  });
  addEventListener('keyup', e => {
    if(keyMap[e.code]){
      keys[keyMap[e.code]] = false; 
      e.preventDefault();
    }
  });

  // Pointer lock
  const overlay = document.getElementById('overlay');
  document.getElementById('startBtn').addEventListener('click', ()=>renderer.domElement.requestPointerLock());
  document.addEventListener('pointerlockchange', ()=>overlay.style.display = (document.pointerLockElement===renderer.domElement)?'none':'');
  document.addEventListener('mousemove', e => {
    if(document.pointerLockElement!==renderer.domElement) return;
    const sens=0.0022;
    player.yaw -= e.movementX*sens;
    player.pitch -= e.movementY*sens;
    player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
  });

  // Movement
  function getMoveDir(){
    const f=(keys.forward?1:0)-(keys.back?1:0);
    const s=(keys.right?1:0)-(keys.left?1:0);
    const dir=new THREE.Vector3(s,0,-f); // W forward
    if(dir.lengthSq()===0) return dir;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0,1,0), player.yaw);
    return dir;
  }

  // Animation loop
  let prev = performance.now()/1000;
  function animate(){
    const now = performance.now()/1000;
    const dt = Math.min(0.1, now-prev);
    prev = now;

    const dir = getMoveDir();
    const maxSpeed = (keys.run?PLAYER.runSpeed:PLAYER.walkSpeed);

    // Horizontal movement
    if(dir.lengthSq() > 0){
      const desired = dir.multiplyScalar(maxSpeed);
      player.vel.x = THREE.MathUtils.lerp(player.vel.x, desired.x, 1-Math.exp(-PLAYER.accel*dt));
      player.vel.z = THREE.MathUtils.lerp(player.vel.z, desired.z, 1-Math.exp(-PLAYER.accel*dt));
    } else {
      player.vel.x *= PLAYER.friction;
      player.vel.z *= PLAYER.friction;
    }

    // Gravity
    player.vel.y += PLAYER.gravity * dt;

    // Update position
    player.pos.addScaledVector(player.vel, dt);

    // Ground collision
    if(player.pos.y < PLAYER.eyeHeight){
      player.pos.y = PLAYER.eyeHeight;
      player.vel.y = 0;
      player.grounded = true;
    }

    updateCamera();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  addEventListener('resize', ()=>{
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
})();
