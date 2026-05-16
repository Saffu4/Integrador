'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, AreaChart, Area
} from 'recharts'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import PIDPanel from './components/PIDPanel'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// ── Gauge SVG circular ───────────────────────────────────────────
function GaugeAngle({ actual, deseado }) {
  const cx = 100, cy = 100, r = 80
  const toRad = (d) => (d * Math.PI) / 180
  const startAngle = 225, range = 270

  const angleToXY = (val) => {
    const pct = (val + 135) / 270
    const angle = startAngle - pct * range
    return { x: cx + r * Math.cos(toRad(angle)), y: cy - r * Math.sin(toRad(angle)) }
  }

  const arcPath = (pct, color) => {
    const startRad = toRad(startAngle)
    const endRad   = toRad(startAngle - pct * range)
    const large    = pct * range > 180 ? 1 : 0
    const x1 = cx + r * Math.cos(startRad), y1 = cy - r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad),   y2 = cy - r * Math.sin(endRad)
    return <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
  }

  const needle = angleToXY(actual)
  const target = angleToXY(deseado)
  const pctActual  = (actual  + 135) / 270
  const pctDeseado = (deseado + 135) / 270

  return (
    <svg viewBox="0 0 200 180" style={{ width: '100%', maxWidth: 220 }}>
      <path
        d={`M ${cx + r * Math.cos(toRad(startAngle))} ${cy - r * Math.sin(toRad(startAngle))}
            A ${r} ${r} 0 1 1 ${cx + r * Math.cos(toRad(startAngle - range))} ${cy - r * Math.sin(toRad(startAngle - range))}`}
        fill="none" stroke="#1f2937" strokeWidth="8"
      />
      {arcPath(pctDeseado, '#f59e0b44')}
      {arcPath(pctActual,  '#00d4aa')}
      <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="#00d4aa" strokeWidth="2.5" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={target.x} y2={target.y} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 2" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill="#00d4aa" />
      <text x={cx} y={cy + 28} textAnchor="middle" fill="#00d4aa" fontSize="22" fontFamily="'Share Tech Mono', monospace" fontWeight="bold">
        {actual.toFixed(1)}°
      </text>
      <text x={cx} y={cy + 44} textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="'Rajdhani', sans-serif">
        Ángulo actual
      </text>
      <text x="14"  y="156" fill="#64748b" fontSize="9" fontFamily="monospace">-135°</text>
      <text x="162" y="156" fill="#64748b" fontSize="9" fontFamily="monospace">+135°</text>
    </svg>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────
function KPICard({ label, value, unit, color = '#00d4aa', sub }) {
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '16px 20px', borderTop: `2px solid ${color}`,
    }}>
      <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
        {value}<span style={{ fontSize: 14, marginLeft: 4, opacity: 0.7 }}>{unit}</span>
      </div>
      {sub && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

// ── Custom Tooltip ────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#111827', border: '1px solid #1f2937', borderRadius: 6,
      padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 12,
    }}>
      <div style={{ color: '#64748b', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────────
export default function Dashboard() {
  const [sesiones, setSesiones]     = useState([])
  const [sesionId, setSesionId]     = useState('')
  const [telemetria, setTelemetria] = useState([])
  const [live, setLive]             = useState(null)
  const [stats, setStats]           = useState(null)
  const [loading, setLoading]       = useState(true)
  const [connected, setConnected]   = useState(false)
  const bufferRef = useRef([])

  const cargarSesiones = useCallback(async () => {
    const { data } = await supabase
      .from('sesiones')
      .select('*')
      .order('iniciada_en', { ascending: false })
      .limit(20)
    if (data) {
      setSesiones(data)
      if (!sesionId && data.length > 0) setSesionId(data[0].id)
    }
  }, [sesionId])

  const cargarHistorico = useCallback(async (sid) => {
    setLoading(true)
    const { data } = await supabase
      .from('telemetria')
      .select('*')
      .eq('sesion_id', sid)
      .order('ts', { ascending: true })
      .limit(500)

    if (data && data.length > 0) {
      const fmt = data.map((r) => ({ ...r, t: format(new Date(r.ts), 'HH:mm:ss') }))
      bufferRef.current = fmt
      setTelemetria(fmt)
      setLive(fmt[fmt.length - 1])
    }

    const { data: st } = await supabase.rpc('stats_sesion', { p_sesion_id: sid })
    if (st && st.length > 0) setStats(st[0])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!sesionId) return
    cargarHistorico(sesionId)

    const channel = supabase
      .channel(`telemetria-${sesionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'telemetria', filter: `sesion_id=eq.${sesionId}` },
        (payload) => {
          const row = { ...payload.new, t: format(new Date(payload.new.ts), 'HH:mm:ss') }
          bufferRef.current = [...bufferRef.current.slice(-499), row]
          setTelemetria([...bufferRef.current])
          setLive(row)
          setConnected(true)
        }
      )
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    return () => supabase.removeChannel(channel)
  }, [sesionId, cargarHistorico])

  useEffect(() => { cargarSesiones() }, [])

  const ang_actual  = live?.angulo_actual  ?? 0
  const ang_deseado = live?.angulo_deseado ?? 0
  const pwm         = live?.salida_pid     ?? 0
  const err         = live?.error_pid      ?? 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 40 }}>

      {/* HEADER */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="32" height="32" viewBox="0 0 32 32">
            <circle cx="16" cy="28" r="3" fill="#00d4aa" />
            <line x1="16" y1="28" x2="16" y2="10" stroke="#00d4aa" strokeWidth="2" />
            <circle cx="16" cy="8" r="5" fill="none" stroke="#00d4aa" strokeWidth="1.5" />
            <path d="M 8 8 Q 16 2 24 8" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2 1" />
          </svg>
          <div>
            <h1 style={{ fontFamily: 'var(--sans)', fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>AEROPÉNDULO</h1>
            <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 3 }}>TELEMETRÍA EN TIEMPO REAL</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div>
            <label style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 2, marginRight: 8 }}>SESIÓN</label>
            <select
              value={sesionId}
              onChange={(e) => setSesionId(e.target.value)}
              style={{
                background: 'var(--panel)', border: '1px solid var(--border)',
                color: 'var(--text)', borderRadius: 6, padding: '6px 12px',
                fontFamily: 'var(--sans)', fontSize: 13, cursor: 'pointer',
              }}
            >
              {sesiones.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {format(new Date(s.iniciada_en), 'dd/MM/yy HH:mm')}{s.activa ? ' 🟢' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: connected ? '#00d4aa' : '#ef4444',
              boxShadow: connected ? '0 0 8px #00d4aa' : '0 0 8px #ef4444',
              animation: connected ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{connected ? 'EN VIVO' : 'DESCONECTADO'}</span>
          </div>
        </div>
      </header>

      <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>

        {/* FILA 1: Gauge + KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, marginBottom: 24 }}>
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <GaugeAngle actual={ang_actual} deseado={ang_deseado} />
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <div style={{ color: '#f59e0b', fontSize: 12, fontFamily: 'var(--mono)' }}>▶ {ang_deseado.toFixed(1)}° deseado</div>
              <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                Error: <span style={{ color: Math.abs(err) > 5 ? '#ef4444' : '#00d4aa' }}>{err.toFixed(2)}°</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 16 }}>
            <KPICard label="Ángulo actual"           value={ang_actual.toFixed(1)}   unit="°" color="#00d4aa" sub="potenciómetro filtrado" />
            <KPICard label="Setpoint"                value={ang_deseado.toFixed(1)}  unit="°" color="#f59e0b" sub="objetivo ingresado" />
            <KPICard label="PWM salida"              value={pwm.toFixed(1)}           unit="%" color={pwm > 80 ? '#ef4444' : '#00d4aa'} sub="señal al ESC" />
            <KPICard label="Error PID"               value={Math.abs(err).toFixed(2)} unit="°" color={Math.abs(err) > 10 ? '#ef4444' : '#00d4aa'} sub="rampa - actual" />
            <KPICard label="Error promedio (sesión)" value={stats ? Number(stats.error_promedio).toFixed(2) : '—'} unit="°" color="#a78bfa" sub="desempeño histórico" />
            <KPICard label="Duración sesión"         value={stats ? Math.round(stats.duracion_segundos) : '—'} unit="s" color="#60a5fa" sub={`${stats?.total_muestras ?? 0} muestras`} />
          </div>
        </div>

        {/* FILA 2: Ángulo histórico */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--sans)', fontSize: 14, letterSpacing: 2, color: 'var(--muted)', marginBottom: 20 }}>
            POSICIÓN ANGULAR — HISTÓRICO DE SESIÓN
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={telemetria} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00d4aa" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00d4aa" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDeseado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }} interval="preserveStartEnd" />
              <YAxis domain={[-135, 135]} tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <ReferenceLine y={0} stroke="#ffffff22" />
              <Area type="monotone" dataKey="angulo_deseado" name="Deseado" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" fill="url(#gradDeseado)" dot={false} />
              <Area type="monotone" dataKey="angulo_actual"  name="Actual"  stroke="#00d4aa" strokeWidth={2}   fill="url(#gradActual)"  dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* FILA 3: PWM + Error PID */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontFamily: 'var(--sans)', fontSize: 14, letterSpacing: 2, color: 'var(--muted)', marginBottom: 20 }}>SALIDA PWM (ESC)</h2>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={telemetria} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="gradPWM" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={80} stroke="#ef444444" strokeDasharray="3 2" label={{ value: '80%', fill: '#ef4444', fontSize: 9 }} />
                <Area type="monotone" dataKey="salida_pid" name="PWM %" stroke="#60a5fa" strokeWidth={2} fill="url(#gradPWM)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontFamily: 'var(--sans)', fontSize: 14, letterSpacing: 2, color: 'var(--muted)', marginBottom: 20 }}>ERROR PID + ACUMULADO</h2>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={telemetria} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <ReferenceLine y={0} stroke="#ffffff22" />
                <Line type="monotone" dataKey="error_pid"       name="Error"     stroke="#f87171" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="error_acumulado" name="Acumulado" stroke="#a78bfa" strokeWidth={1}   dot={false} strokeDasharray="3 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FILA 4: Panel PID */}
        <div style={{ marginBottom: 24 }}>
          <PIDPanel supabase={supabase} />
        </div>

        {/* FILA 5: Tabla sesiones */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontFamily: 'var(--sans)', fontSize: 14, letterSpacing: 2, color: 'var(--muted)', marginBottom: 20 }}>
            HISTORIAL DE SESIONES
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Nombre', 'Inicio', 'Hace', 'Estado'].map((h) => (
                    <th key={h} style={{ padding: '8px 16px', textAlign: 'left', color: 'var(--muted)', letterSpacing: 2, fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sesiones.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSesionId(s.id)}
                    style={{
                      borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      background: s.id === sesionId ? '#00d4aa11' : 'transparent',
                      transition: 'background 0.2s',
                    }}
                  >
                    <td style={{ padding: '10px 16px', color: 'var(--text)' }}>{s.nombre}</td>
                    <td style={{ padding: '10px 16px', color: '#94a3b8' }}>{format(new Date(s.iniciada_en), 'dd/MM/yyyy HH:mm:ss')}</td>
                    <td style={{ padding: '10px 16px', color: '#64748b' }}>{formatDistanceToNow(new Date(s.iniciada_en), { locale: es, addSuffix: true })}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: 20, fontSize: 11,
                        background: s.activa ? '#00d4aa22' : '#1f2937',
                        color: s.activa ? '#00d4aa' : '#64748b',
                        border: `1px solid ${s.activa ? '#00d4aa44' : '#374151'}`,
                      }}>
                        {s.activa ? 'ACTIVA' : 'CERRADA'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
