(() => {
  const ROOM = { width: 12, depth: 18, height: 4.2 };
  const PLAYER = {
    radius: 0.3,
    eyeHeight: 1.65,
    speedWalk: 2.2,
    speedRun: 5,
    accel: 20,
    decel: 20,
    jumpSpeed: 5
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222233);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 10, 5);
  scene.add(dir);

  // Room geometry
  const halfW = ROOM.width/2, halfD = ROOM.depth/2, halfH = ROOM.height/2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), new THREE.MeshStandardMaterial({color:0x888888}));
  floor.rotation.x = -Math.PI/2;
  floor.position.y = -halfH;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), new THREE.MeshStandardMaterial({color:0x555577}));
  ceiling.rotation.x = Math.PI/2;
  ceiling.position.y = halfH;
  scene.add(ceiling);

  function makeWall(w,h,pos,rot,color){
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshStandardMaterial({color}));
    wall.position.copy(pos);
    if(rot) wall.rotation.y = rot;
    scene.add(wall);
    return wall;
  }
  makeWall(ROOM.width, ROOM.height, new THREE.Vector3(0,0,-halfD), Math.PI, 0x336699);
  makeWall(ROOM.width, ROOM.height, new THREE.Vector3(0,0,halfD), 0, 0x336699);
  makeWall(ROOM.depth, ROOM.height, new THREE.Vector3(-halfW,0,0), Math.PI/2, 0x336699);
  makeWall(ROOM.depth, ROOM.height, new THREE.Vector3(halfW,0,0), -Math.PI/2, 0x336699);

  // Obstacles
  const colliders = [];
  const box = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({color:0xff8844}));
  box.position.set(2, -halfH+0.5, -2);
  scene.add(box); colliders.push(box);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,ROOM.height-0.4,16), new THREE.MeshStandardMaterial({color:0x44bbff}));
  pillar.position.set(-2,0,3);
  scene.add(pillar); colliders.push(pillar);

  // Player state
  const player = {
    pos: new THREE.Vector3(0, -halfH+PLAYER.eyeHeight, 0),
    vel: new THREE.Vector3(),
    yaw: 0, pitch: 0, grounded: false
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
  addEventListener('keydown',e=>{ if(keyMap[e.code]){ keys[keyMap[e.code]]=true; e.preventDefault(); }});
  addEventListener('keyup',e=>{ if(keyMap[e.code]){ keys[keyMap[e.code]]=false; e.preventDefault(); }});

  // Pointer lock
  const overlay=document.getElementById('overlay');
  document.getElementById('startBtn').addEventListener('click',()=>renderer.domElement.requestPointerLock());
  document.addEventListener('pointerlockchange',()=>overlay.style.display=(document.pointerLockElement===renderer.domElement)?'none':'');
  document.addEventListener('mousemove',e=>{
    if(document.pointerLockElement!==renderer.domElement) return;
    const sens=0.0022;
    player.yaw -= e.movementX*sens;
    player.pitch -= e.movementY*sens;
    player.pitch=Math.max(-Math.PI/2+0.01,Math.min(Math.PI/2-0.01,player.pitch));
  });

  // Movement
  function getMoveDir(){
    const f=(keys.forward?1:0)-(keys.back?1:0);
    const s=(keys.right?1:0)-(keys.left?1:0);
    // Fixed: W is forward (negative Z)
    const dir=new THREE.Vector3(s,0,-f);
    if(dir.lengthSq()===0) return dir;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0,1,0), player.yaw);
    return dir;
  }

  function collideRoom(pos){
    const r=PLAYER.radius;
    pos.x=Math.max(-halfW+r,Math.min(halfW-r,pos.x));
    pos.z=Math.max(-halfD+r,Math.min(halfD-r,pos.z));
    const floorY=-halfH, ceilY=halfH;
    pos.y=Math.min(ceilY-0.1, pos.y);
    if(pos.y<floorY+PLAYER.eyeHeight){ pos.y=floorY+PLAYER.eyeHeight; player.vel.y=0; player.grounded=true; }
  }

  function collideObjects(pos){
    const r=PLAYER.radius;
    const tempBox=new THREE.Box3();
    for(const mesh of colliders){
      mesh.geometry.computeBoundingBox();
      tempBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      tempBox.expandByScalar(r);
      if(tempBox.containsPoint(pos)){
        const clamped=pos.clone().clamp(tempBox.min,tempBox.max);
        const push=pos.clone().sub(clamped);
        if(push.lengthSq()>0){
          push.setLength(r);
          pos.copy(clamped.add(push));
        }
      }
    }
  }

  // Loop
  let prev=performance.now()/1000;
  function animate(){
    const now=performance.now()/1000, dt=Math.min(0.1, now-prev); prev=now;

    const dir=getMoveDir();
    const run=keys.run;
    const targetSpeed=(dir.length()>0)?(run?PLAYER.speedRun:PLAYER.speedWalk):0;
    const flat=new THREE.Vector3(player.vel.x,0,player.vel.z);
    const desired=dir.multiplyScalar(targetSpeed);
    flat.lerp(desired, 1-Math.exp(-PLAYER.accel*dt));
    player.vel.x=flat.x; player.vel.z=flat.z;

    // Gravity & jump
    player.vel.y+=-9.81*dt;
    if(keys.jump && player.grounded){ player.vel.y=PLAYER.jumpSpeed; player.grounded=false; }

    player.pos.addScaledVector(player.vel,dt);

    player.grounded=false;
    collideRoom(player.pos);
    collideObjects(player.pos);

    updateCamera();
    renderer.render(scene,camera);
    requestAnimationFrame(animate);
  }
  animate();

  addEventListener('resize',()=>{
    camera.aspect=innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  });
})();
