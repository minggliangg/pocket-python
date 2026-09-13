import * as THREE from 'three'

/**
 * Evangelion-styled progress core:
 * - AT Field (hex barrier) that strengthens with completion
 * - Pulsing Eva core (purple shell, green iris)
 * - Ring of hex nodes: lit = solved (Unit-01 purple/green), dim = open
 * Drag to orbit; pinch/wheel to zoom; idle auto-spin.
 */
export function mountProgressScene(container, { solvedCount, totalCount } = {}) {
  const total = Math.max(1, totalCount || 1)
  const solved = Math.max(0, Math.min(solvedCount || 0, total))
  const ratio = solved / total

  const width = container.clientWidth || 280
  const height = container.clientHeight || 280

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height, false)
  renderer.setClearColor(0x0a0610, 0)
  container.appendChild(renderer.domElement)
  renderer.domElement.style.touchAction = 'none'
  renderer.domElement.style.cursor = 'grab'

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x0a0610, 0.045)

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60)
  let camDist = 5.4
  camera.position.set(0, 0.55, camDist)

  // Unit-01 palette
  const purple = new THREE.Color(0x6b21a8)
  const purpleDeep = new THREE.Color(0x3b0764)
  const neon = new THREE.Color(0xa3ff12)
  const red = new THREE.Color(0xff1a1a)
  const dimHex = new THREE.Color(0x2a1840)

  const ambient = new THREE.AmbientLight(0xb794f4, 0.45)
  scene.add(ambient)
  const key = new THREE.PointLight(neon, 22, 24)
  key.position.set(2.2, 3.2, 3.5)
  scene.add(key)
  const rim = new THREE.PointLight(purple, 16, 24)
  rim.position.set(-3, 1, 2)
  scene.add(rim)
  const under = new THREE.PointLight(0xff2020, 6, 16)
  under.position.set(0, -2.5, 0)
  scene.add(under)

  const root = new THREE.Group()
  scene.add(root)

  // —— Core orb (Eva core) ——
  const coreR = 0.42 + ratio * 0.55
  const coreGeo = new THREE.IcosahedronGeometry(coreR, 2)
  const coreMat = new THREE.MeshStandardMaterial({
    color: purpleDeep,
    emissive: purple,
    emissiveIntensity: 0.35 + ratio * 0.8,
    metalness: 0.55,
    roughness: 0.22,
    flatShading: true,
  })
  const core = new THREE.Mesh(coreGeo, coreMat)
  root.add(core)

  // Neon iris shell
  const irisGeo = new THREE.IcosahedronGeometry(coreR * 1.08, 1)
  const irisMat = new THREE.MeshBasicMaterial({
    color: neon,
    wireframe: true,
    transparent: true,
    opacity: 0.15 + ratio * 0.35,
  })
  const iris = new THREE.Mesh(irisGeo, irisMat)
  root.add(iris)

  // —— AT Field: stacked hex rings ——
  const hexRadius = 0.22
  const hexShape = new THREE.Shape()
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    const x = Math.cos(a) * hexRadius
    const y = Math.sin(a) * hexRadius
    if (i === 0) hexShape.moveTo(x, y)
    else hexShape.lineTo(x, y)
  }
  hexShape.closePath()
  const hexGeo = new THREE.ShapeGeometry(hexShape)
  const hexWire = new THREE.WireframeGeometry(hexGeo)
  const hexMatOn = new THREE.LineBasicMaterial({
    color: neon,
    transparent: true,
    opacity: 0.85,
  })
  const hexMatOff = new THREE.LineBasicMaterial({
    color: dimHex,
    transparent: true,
    opacity: 0.55,
  })
  const hexMatCore = new THREE.LineBasicMaterial({
    color: purple,
    transparent: true,
    opacity: 0.9,
  })

  const atField = new THREE.Group()
  // Vertical hex columns around the core
  const COLS = 10
  const ROWS = 5
  const litCount = Math.round(COLS * ROWS * Math.max(ratio, 0.04))
  let lit = 0
  for (let c = 0; c < COLS; c += 1) {
    const angle = (c / COLS) * Math.PI * 2
    const radius = 1.55
    for (let r = 0; r < ROWS; r += 1) {
      const y = (r - (ROWS - 1) / 2) * 0.38
      const isLit = lit < litCount
      lit += 1
      const lines = new THREE.LineSegments(
        hexWire,
        isLit ? hexMatOn : hexMatOff
      )
      lines.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      // Face outward
      lines.lookAt(0, y, 0)
      lines.rotateY(Math.PI)
      atField.add(lines)
    }
  }
  root.add(atField)

  // Outer halo ring (progress arc)
  const haloR = 2.05 + ratio * 0.15
  const haloGeo = new THREE.TorusGeometry(haloR, 0.018, 8, 100)
  const haloMat = new THREE.MeshBasicMaterial({
    color: purple,
    transparent: true,
    opacity: 0.5,
  })
  const halo = new THREE.Mesh(haloGeo, haloMat)
  halo.rotation.x = Math.PI / 2.2
  root.add(halo)

  const arcSpan = Math.max(0.08, Math.PI * 2 * ratio)
  const arcGeo = new THREE.TorusGeometry(haloR, 0.05, 8, Math.max(12, Math.floor(80 * ratio)), arcSpan)
  const arcMat = new THREE.MeshBasicMaterial({ color: neon })
  const arc = new THREE.Mesh(arcGeo, arcMat)
  arc.rotation.x = Math.PI / 2.2
  arc.rotation.z = Math.PI // start at top
  root.add(arc)

  // —— Problem nodes spiral (mines of the MAGI fan) ——
  const shown = Math.min(total, 42)
  const nodeGeo = new THREE.OctahedronGeometry(0.075, 0)
  const nodeOn = new THREE.MeshStandardMaterial({
    color: purple,
    emissive: neon,
    emissiveIntensity: 0.85,
    metalness: 0.3,
    roughness: 0.3,
  })
  const nodeOff = new THREE.MeshStandardMaterial({
    color: 0x1f1528,
    emissive: red,
    emissiveIntensity: 0.08,
    metalness: 0.1,
    roughness: 0.75,
    transparent: true,
    opacity: 0.7,
  })
  const nodes = new THREE.Group()
  for (let i = 0; i < shown; i += 1) {
    const t = i / shown
    const angle = t * Math.PI * 2 * 2.4
    const y = (t - 0.5) * 2.6
    const radius = 1.15 + Math.sin(t * Math.PI) * 0.35
    const mesh = new THREE.Mesh(nodeGeo, i < solved ? nodeOn : nodeOff)
    mesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
    mesh.rotation.y = angle
    nodes.add(mesh)
  }
  root.add(nodes)

  // Floor: hex grid disc
  const floorGeo = new THREE.CircleGeometry(2.35, 6)
  const floorMat = new THREE.MeshBasicMaterial({
    color: purpleDeep,
    transparent: true,
    opacity: 0.35,
    wireframe: true,
  })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -1.55
  root.add(floor)

  // —— Tiny Unit-01 flyby (occasional) ——
  const eva = new THREE.Group()
  {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x4c1d95,
      emissive: 0x2e1065,
      emissiveIntensity: 0.4,
      metalness: 0.5,
      roughness: 0.35,
      flatShading: true,
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xa3ff12,
      emissive: 0xa3ff12,
      emissiveIntensity: 0.7,
      metalness: 0.2,
      roughness: 0.4,
      flatShading: true,
    })
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xff1a1a,
      emissive: 0xff1a1a,
      emissiveIntensity: 0.5,
      flatShading: true,
    })

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.12), bodyMat)
    eva.add(torso)

    // Head (slightly long Eva-ish)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.12), bodyMat)
    head.position.y = 0.22
    eva.add(head)
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.02), trimMat)
    crest.position.set(0, 0.28, 0.05)
    eva.add(crest)
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.02), trimMat)
    eye.position.set(0, 0.22, 0.06)
    eva.add(eye)

    // Chest core light
    const chest = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), trimMat)
    chest.position.set(0, 0.06, 0.07)
    eva.add(chest)

    // Arms / shoulder pylons
    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), bodyMat)
    shoulderL.position.set(-0.14, 0.12, 0)
    eva.add(shoulderL)
    const shoulderR = shoulderL.clone()
    shoulderR.position.x = 0.14
    eva.add(shoulderR)
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), bodyMat)
    armL.position.set(-0.14, -0.02, 0)
    armL.rotation.z = 0.25
    eva.add(armL)
    const armR = armL.clone()
    armR.position.x = 0.14
    armR.rotation.z = -0.25
    eva.add(armR)

    // Legs tucked (flight pose)
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.06), bodyMat)
    legL.position.set(-0.05, -0.24, -0.02)
    legL.rotation.x = -0.5
    eva.add(legL)
    const legR = legL.clone()
    legR.position.x = 0.05
    eva.add(legR)

    // Tiny wing / thruster fins
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.12), redMat)
    fin.position.set(0, 0.02, -0.1)
    fin.rotation.x = 0.4
    eva.add(fin)

    eva.scale.setScalar(0.55)
    eva.visible = false
    eva.userData = { bodyMat, trimMat, redMat }
    root.add(eva)
  }

  let evaPhase = -2.5 // seconds until first appearance
  let evaActive = false
  let evaT = 0

  // —— Interaction: drag orbit + pinch zoom ——
  const pointers = new Map()
  let dragging = false
  let lastX = 0
  let lastY = 0
  let rotY = 0.4
  let rotX = 0.15
  let idleUntil = 0
  let pinchStart = 0
  let pinchDist0 = 0

  const canvas = renderer.domElement

  const onPointerDown = (e) => {
    canvas.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 1) {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      canvas.style.cursor = 'grabbing'
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()]
      pinchDist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      pinchStart = camDist
      dragging = false
    }
  }

  const onPointerMove = (e) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.size === 2) {
      const pts = [...pointers.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (pinchDist0 > 0) {
        const scale = pinchDist0 / Math.max(dist, 1)
        camDist = THREE.MathUtils.clamp(pinchStart * scale, 3.2, 8)
        camera.position.setLength(camDist)
        idleUntil = performance.now() + 2200
      }
      return
    }

    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    rotY += dx * 0.01
    rotX = THREE.MathUtils.clamp(rotX + dy * 0.01, -0.9, 0.9)
    idleUntil = performance.now() + 2200
  }

  const onPointerUp = (e) => {
    pointers.delete(e.pointerId)
    if (pointers.size === 0) {
      dragging = false
      canvas.style.cursor = 'grab'
    }
    if (pointers.size < 2) pinchDist0 = 0
  }

  const onWheel = (e) => {
    e.preventDefault()
    camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.004, 3.2, 8)
    camera.position.setLength(camDist)
    idleUntil = performance.now() + 2200
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  let frame = 0
  let disposed = false
  const start = performance.now()

  const onResize = () => {
    if (disposed) return
    const w = container.clientWidth || 280
    const h = container.clientHeight || 280
    camera.aspect = w / Math.max(h, 1)
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  }
  window.addEventListener('resize', onResize)

  const tick = (now) => {
    if (disposed) return
    const t = (now - start) / 1000
    const dt = Math.min(0.05, t - (tick._last ?? t))
    tick._last = t

    // Idle auto-spin
    if (!dragging && now > idleUntil) {
      rotY += 0.0045
      rotX += Math.sin(t * 0.5) * 0.0004
    }

    root.rotation.y = rotY
    root.rotation.x = rotX

    // Core pulse (A.T. Field heartbeat)
    const pulse = 1 + Math.sin(t * 2.4) * 0.03
    core.scale.setScalar(pulse)
    iris.scale.setScalar(1 + Math.sin(t * 3.1 + 1) * 0.05)
    coreMat.emissiveIntensity = 0.35 + ratio * 0.8 + Math.sin(t * 2.4) * 0.15
    irisMat.opacity = 0.15 + ratio * 0.35 + Math.sin(t * 2.0) * 0.05

    atField.rotation.y = -t * 0.12
    nodes.rotation.y = t * 0.08

    // Eva flyby: appear every ~9–14s, orbit a few seconds, then leave
    if (!evaActive) {
      evaPhase -= dt
      if (evaPhase <= 0) {
        evaActive = true
        evaT = 0
        eva.visible = true
      }
    } else {
      evaT += dt
      const LIFE = 6.5
      const u = evaT / LIFE
      if (u >= 1) {
        evaActive = false
        eva.visible = false
        evaPhase = 7 + Math.random() * 6
      } else {
        // Figure-8 around the core on a tilted plane
        const angle = u * Math.PI * 2 * 1.35
        const R = 2.35
        const x = Math.sin(angle) * R
        const z = Math.sin(angle * 2) * (R * 0.45)
        const y = Math.sin(angle * 0.5) * 0.55 + 0.25
        eva.position.set(x, y, z)

        // Face along velocity (sample next point)
        const a2 = angle + 0.08
        const x2 = Math.sin(a2) * R
        const z2 = Math.sin(a2 * 2) * (R * 0.45)
        const y2 = Math.sin(a2 * 0.5) * 0.55 + 0.25
        eva.lookAt(x2, y2, z2)

        // Fade in/out at ends
        const fade = u < 0.12 ? u / 0.12 : u > 0.88 ? (1 - u) / 0.12 : 1
        const mats = eva.userData
        mats.bodyMat.opacity = 1
        mats.bodyMat.transparent = fade < 1
        mats.bodyMat.opacity = fade
        mats.trimMat.transparent = fade < 1
        mats.trimMat.opacity = fade
        mats.redMat.transparent = fade < 1
        mats.redMat.opacity = fade

        // Subtle bank / bob
        eva.rotation.z = Math.sin(t * 6) * 0.15
        eva.position.y += Math.sin(t * 9) * 0.03
      }
    }

    renderer.render(scene, camera)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)

  return function dispose() {
    disposed = true
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', onResize)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('wheel', onWheel)
    coreGeo.dispose()
    coreMat.dispose()
    irisGeo.dispose()
    irisMat.dispose()
    hexGeo.dispose()
    hexWire.dispose()
    hexMatOn.dispose()
    hexMatOff.dispose()
    hexMatCore.dispose()
    haloGeo.dispose()
    haloMat.dispose()
    arcGeo.dispose()
    arcMat.dispose()
    nodeGeo.dispose()
    nodeOn.dispose()
    nodeOff.dispose()
    floorGeo.dispose()
    floorMat.dispose()
    eva.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) obj.material.dispose()
    })
    renderer.dispose()
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement)
    }
  }
}
