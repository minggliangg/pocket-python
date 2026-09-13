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

  // —— Tiny Eva units (00, 01, 02) — slower patrol orbits ——
  // Built from tapered cylinders + cones for a readable mecha silhouette
  // (long legs, narrow waist, huge shoulder pylons, single-eye head + horn).
  function buildEva({ body, bodyDark, trim, visor, accent }) {
    const g = new THREE.Group()

    const matBody = new THREE.MeshStandardMaterial({
      color: body,
      emissive: bodyDark,
      emissiveIntensity: 0.25,
      metalness: 0.55,
      roughness: 0.32,
      flatShading: true,
      transparent: true,
      opacity: 1,
    })
    const matDark = new THREE.MeshStandardMaterial({
      color: bodyDark,
      emissive: bodyDark,
      emissiveIntensity: 0.15,
      metalness: 0.4,
      roughness: 0.5,
      flatShading: true,
      transparent: true,
      opacity: 1,
    })
    const matTrim = new THREE.MeshStandardMaterial({
      color: trim,
      emissive: trim,
      emissiveIntensity: 0.7,
      metalness: 0.25,
      roughness: 0.35,
      flatShading: true,
      transparent: true,
      opacity: 1,
    })
    const matVisor = new THREE.MeshStandardMaterial({
      color: visor,
      emissive: visor,
      emissiveIntensity: 1.1,
      metalness: 0.1,
      roughness: 0.2,
      transparent: true,
      opacity: 1,
    })
    const matAccent = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.55,
      metalness: 0.3,
      roughness: 0.4,
      flatShading: true,
      transparent: true,
      opacity: 1,
    })

    // --- torso: wide chest tapering to narrow waist ---
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.055, 0.22, 6),
      matBody
    )
    chest.position.y = 0.12
    g.add(chest)

    const waist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.08, 6),
      matDark
    )
    waist.position.y = -0.02
    g.add(waist)

    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.07, 0.08, 6),
      matBody
    )
    pelvis.position.y = -0.08
    g.add(pelvis)

    // chest core (A.T. Field source)
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.028, 0), matTrim)
    core.position.set(0, 0.14, 0.055)
    g.add(core)

    // --- neck + head ---
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.028, 0.04, 5),
      matDark
    )
    neck.position.y = 0.25
    g.add(neck)

    // elongated skull
    const skull = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.05, 0.1, 6),
      matBody
    )
    skull.position.set(0, 0.32, 0.005)
    skull.rotation.x = -0.15
    g.add(skull)

    // jaw / chin (forward)
    const jaw = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.07, 5),
      matBody
    )
    jaw.rotation.x = Math.PI / 2 + 0.25
    jaw.position.set(0, 0.285, 0.045)
    g.add(jaw)

    // single-eye visor strip
    const visorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.018, 0.02),
      matVisor
    )
    visorMesh.position.set(0, 0.335, 0.045)
    g.add(visorMesh)

    // forehead horn (Unit-01 signature; all three keep a short crest)
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.014, 0.09, 4),
      matTrim
    )
    horn.position.set(0, 0.4, 0.02)
    horn.rotation.x = 0.35
    g.add(horn)

    // --- shoulder pylons (the Eva silhouette) ---
    function pylon(sign) {
      const p = new THREE.Group()
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.16, 0.11),
        matBody
      )
      slab.position.y = 0.02
      p.add(slab)
      const wing = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, 0.14, 4),
        matAccent
      )
      wing.position.set(sign * 0.05, 0.08, -0.02)
      wing.rotation.z = sign * -0.9
      wing.rotation.y = sign * 0.4
      p.add(wing)
      // vertical fin
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.12, 0.06),
        matAccent
      )
      fin.position.set(0, 0.1, -0.04)
      p.add(fin)
      return p
    }
    const pyl = pylon(1)
    pyl.position.set(0.11, 0.18, 0)
    pyl.rotation.z = -0.15
    g.add(pyl)
    const pyr = pylon(-1)
    pyr.position.set(-0.11, 0.18, 0)
    pyr.rotation.z = 0.15
    g.add(pyr)

    // --- arms (flight tuck: elbows bent, hands back) ---
    function arm(sign) {
      const a = new THREE.Group()
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.028, 0.12, 5),
        matBody
      )
      upper.position.y = -0.05
      a.add(upper)
      const elbow = new THREE.Mesh(
        new THREE.SphereGeometry(0.024, 5, 4),
        matDark
      )
      elbow.position.y = -0.11
      a.add(elbow)
      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.02, 0.11, 5),
        matBody
      )
      lower.position.set(0, -0.16, 0.03)
      lower.rotation.x = 0.7
      a.add(lower)
      return a
    }
    const armL = arm(1)
    armL.position.set(0.1, 0.16, 0)
    armL.rotation.z = -0.35
    armL.rotation.x = -0.4
    g.add(armL)
    const armR = arm(-1)
    armR.position.set(-0.1, 0.16, 0)
    armR.rotation.z = 0.35
    armR.rotation.x = -0.4
    g.add(armR)

    // --- legs (tucked flight pose: knees up, feet back) ---
    function leg(sign) {
      const l = new THREE.Group()
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.035, 0.14, 5),
        matBody
      )
      thigh.position.y = -0.06
      l.add(thigh)
      const knee = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 5, 4),
        matDark
      )
      knee.position.y = -0.13
      l.add(knee)
      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.028, 0.14, 5),
        matBody
      )
      shin.position.set(0, -0.19, -0.04)
      shin.rotation.x = -0.55
      l.add(shin)
      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.03, 0.07),
        matDark
      )
      foot.position.set(0, -0.25, -0.08)
      l.add(foot)
      return l
    }
    const legL = leg(1)
    legL.position.set(0.04, -0.1, 0)
    legL.rotation.x = 0.85
    g.add(legL)
    const legR = leg(-1)
    legR.position.set(-0.04, -0.1, 0)
    legR.rotation.x = 0.85
    g.add(legR)

    // --- backpack thrusters ---
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.1, 0.05),
      matDark
    )
    pack.position.set(0, 0.1, -0.06)
    g.add(pack)
    const thruster = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, 0.08, 5),
      matAccent
    )
    thruster.position.set(0, 0.04, -0.1)
    thruster.rotation.x = Math.PI
    g.add(thruster)

    // slight forward flight pitch
    g.rotation.x = -0.35
    g.scale.setScalar(0.72)
    g.visible = false
    g.userData = { mats: [matBody, matDark, matTrim, matVisor, matAccent] }
    root.add(g)
    return g
  }

  // Unit-00 (Rei) pale/blue · Unit-01 (Shinji) purple/green · Unit-02 (Asuka) red
  const evas = [
    {
      id: '00',
      mesh: buildEva({
        body: 0xe8e4df,
        bodyDark: 0x64748b,
        trim: 0x38bdf8,
        visor: 0x22d3ee,
        accent: 0x94a3b8,
      }),
      phase: 1.8,
      active: false,
      t: 0,
      radius: 2.2,
      yBase: 0.4,
      loops: 0.85,
    },
    {
      id: '01',
      mesh: buildEva({
        body: 0x5b21b6,
        bodyDark: 0x1e1035,
        trim: 0xa3ff12,
        visor: 0xa3ff12,
        accent: 0x2e1065,
      }),
      phase: 6.5,
      active: false,
      t: 0,
      radius: 2.45,
      yBase: 0.18,
      loops: 1.0,
    },
    {
      id: '02',
      mesh: buildEva({
        body: 0xb91c1c,
        bodyDark: 0x450a0a,
        trim: 0x86efac,
        visor: 0xfbbf24,
        accent: 0x7f1d1d,
      }),
      phase: 11,
      active: false,
      t: 0,
      radius: 2.05,
      yBase: 0.55,
      loops: 0.8,
    },
  ]
  const EVA_LIFE = 11 // seconds per pass

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

    // Eva patrols: 00 / 01 / 02, staggered and slow
    for (const e of evas) {
      if (!e.active) {
        e.phase -= dt
        if (e.phase <= 0) {
          e.active = true
          e.t = 0
          e.mesh.visible = true
        }
        continue
      }
      e.t += dt
      const u = e.t / EVA_LIFE
      if (u >= 1) {
        e.active = false
        e.mesh.visible = false
        e.phase = 10 + Math.random() * 8
        continue
      }
      const angle = u * Math.PI * 2 * e.loops
      const R = e.radius
      const x = Math.sin(angle) * R
      const z = Math.sin(angle * 2) * (R * 0.4)
      const y = Math.sin(angle * 0.5) * 0.45 + e.yBase
      e.mesh.position.set(x, y, z)

      const a2 = angle + 0.06
      const x2 = Math.sin(a2) * R
      const z2 = Math.sin(a2 * 2) * (R * 0.4)
      const y2 = Math.sin(a2 * 0.5) * 0.45 + e.yBase
      e.mesh.lookAt(x2, y2, z2)

      const fade = u < 0.1 ? u / 0.1 : u > 0.9 ? (1 - u) / 0.1 : 1
      for (const m of e.mesh.userData.mats || []) {
        m.opacity = fade
        m.transparent = fade < 1
      }
      e.mesh.rotation.z = Math.sin(t * 3) * 0.08
      e.mesh.position.y += Math.sin(t * 4.5) * 0.02
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
    for (const e of evas) {
      e.mesh.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) obj.material.dispose()
      })
    }
    renderer.dispose()
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement)
    }
  }
}
