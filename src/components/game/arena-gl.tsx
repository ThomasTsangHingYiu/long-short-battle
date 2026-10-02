import { Canvas, useFrame } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

class GLBoundary extends Component<{ children: ReactNode }, { dead: boolean }> {
  state = { dead: false };
  static getDerivedStateFromError() {
    return { dead: true };
  }
  render() {
    return this.state.dead ? null : this.props.children;
  }
}

function Floor() {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    let alive = true;
    let loaded: THREE.Texture | null = null;
    loader.load("/art/arena.jpg", (next) => {
      next.colorSpace = THREE.SRGBColorSpace;
      loaded = next;
      if (alive) setTex(next);
      else next.dispose();
    });
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, []);
  if (!tex) return null;
  return (
    <mesh rotation={[-1.02, 0, 0]} position={[0, -0.15, 0]}>
      <planeGeometry args={[16, 9]} />
      <meshStandardMaterial map={tex} roughness={0.7} metalness={0.2} />
    </mesh>
  );
}

function Ring() {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 0.15;
  });
  return (
    <group ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <mesh>
        <torusGeometry args={[1.85, 0.03, 12, 90]} />
        <meshStandardMaterial color="#ffe1a0" emissive="#c48a22" emissiveIntensity={0.9} metalness={0.7} roughness={0.28} />
      </mesh>
      <mesh>
        <torusGeometry args={[1.45, 0.012, 8, 70]} />
        <meshStandardMaterial color="#fff4cf" emissive="#ffe7a8" emissiveIntensity={1.1} metalness={0.4} roughness={0.2} />
      </mesh>
    </group>
  );
}
function Sparks() {
  const points = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(110 * 3);
    for (let i = 0; i < 110; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = Math.random() * 2.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5.5;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe1a3,
      size: 0.045,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    return new THREE.Points(geo, mat);
  }, []);
  useFrame((_, dt) => {
    points.rotation.y += dt * 0.07;
    points.position.y = Math.sin(points.rotation.y * 3) * 0.05;
  });
  return <primitive object={points} />;
}

function Rig() {
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    camera.position.x = Math.sin(t * 0.18) * 0.18;
    camera.position.y = 2.7 + Math.sin(t * 0.32) * 0.05;
    camera.lookAt(0, 0.05, 0);
  });
  return null;
}

function Scene() {
  return (
    <>
      <color attach="background" args={["#070d0b"]} />
      <ambientLight intensity={0.7} />
      <spotLight position={[0, 7.5, 2.2]} angle={0.55} penumbra={0.75} intensity={28} color="#ffd392" />
      <pointLight position={[-3.2, 1.4, 1]} intensity={4} color="#3ddc97" />
      <pointLight position={[3.2, 1.4, 1]} intensity={3} color="#ef4d4d" />
      <Floor />
      <Ring />
      <Sparks />
      <Rig />
    </>
  );
}

export function ArenaGL() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  if (!on) return null;
  return (
    <GLBoundary>
      <div className="pointer-events-none absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 2.7, 7.4], fov: 34 }} gl={{ antialias: true, alpha: false }} dpr={[1, 1.5]}>
          <Scene />
        </Canvas>
      </div>
    </GLBoundary>
  );
}
