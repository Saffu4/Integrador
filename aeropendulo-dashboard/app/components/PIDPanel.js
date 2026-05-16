'use client'

import { useEffect, useState, useRef } from 'react'

function ParamSlider({ label, symbol, value, min, max, step, color, onChange, description }) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(String(value))

  useEffect(() => { if (!editing) setInputVal(String(value)) }, [value, editing])

  const commit = () => {
    const n = parseFloat(inputVal)
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)))
    setEditing(false)
  }

  const pct = ((value - min) / (max - min)) * 100

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <span style={{ color, fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700 }}>{symbol}</span>
          <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 8, letterSpacing: 1 }}>{label}</span>
        </div>
        {editing ? (
          <input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
            autoFocus
            style={{
              background: '#0d1117', border: `1px solid ${color}`, color,
              borderRadius: 4, padding: '3px 8px', width: 80, textAlign: 'right',
              fontFamily: 'var(--mono)', fontSize: 14, outline: 'none',
            }}
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            title="Clic para editar"
            style={{
              color, fontFamily: 'var(--mono)', fontSize: 16, cursor: 'pointer',
              padding: '2px 8px', borderRadius: 4, border: '1px solid transparent',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = color}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
          >
            {value}
          </span>
        )}
      </div>

      <div
        style={{ position: 'relative', height: 6, borderRadius: 3, background: '#1f2937', cursor: 'pointer' }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const p = (e.clientX - rect.left) / rect.width
          onChange(parseFloat((min + p * (max - min)).toFixed(step < 0.01 ? 4 : step < 0.1 ? 3 : 2)))
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.1s' }} />
        <div style={{
          position: 'absolute', top: '50%', left: `${pct}%`,
          transform: 'translate(-50%, -50%)',
          width: 14, height: 14, borderRadius: '50%',
          background: color, border: '2px solid var(--bg)',
          boxShadow: `0 0 8px ${color}88`, cursor: 'grab',
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'grab', margin: 0 }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ color: '#374151', fontSize: 10, fontFamily: 'var(--mono)' }}>{min}</span>
        <span style={{ color: 'var(--muted)', fontSize: 10, fontStyle: 'italic' }}>{description}</span>
        <span style={{ color: '#374151', fontSize: 10, fontFamily: 'var(--mono)' }}>{max}</span>
      </div>
    </div>
  )
}

function ChangeLog({ entries }) {
  return (
    <div style={{ marginTop: 16, maxHeight: 140, overflowY: 'auto' }}>
      <div style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>HISTORIAL DE CAMBIOS</div>
      {entries.length === 0 && (
        <div style={{ color: '#374151', fontSize: 11, fontFamily: 'var(--mono)' }}>Sin cambios en esta sesión</div>
      )}
      {entries.map((e, i) => (
        <div key={i} style={{
          display: 'flex', gap: 12, padding: '6px 0',
          borderBottom: '1px solid #1f2937', fontSize: 11, fontFamily: 'var(--mono)',
        }}>
          <span style={{ color: '#374151', minWidth: 60 }}>{e.time}</span>
          <span style={{ color: '#60a5fa' }}>Kp={e.kp}</span>
          <span style={{ color: '#34d399' }}>Ki={e.ki}</span>
          <span style={{ color: '#f472b6' }}>Kd={e.kd}</span>
          <span style={{ color: '#fbbf24' }}>R={e.rampa}</span>
        </div>
      ))}
    </div>
  )
}

export default function PIDPanel({ supabase }) {
  const [config, setConfig]   = useState({ id: null, kp: 1.2, ki: 0.05, kd: 0.4, rampa_vel: 40.0 })
  const [pending, setPending] = useState({ kp: 1.2, ki: 0.05, kd: 0.4, rampa_vel: 40.0 })
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')
  const [log, setLog]         = useState([])
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('configuracion_pid')
        .select('*')
        .eq('activo', true)
        .limit(1)
      if (data && data.length > 0) {
        const c = data[0]
        setConfig(c)
        setPending({ kp: c.kp, ki: c.ki, kd: c.kd, rampa_vel: c.rampa_vel })
      }
    }
    load()

    const ch = supabase.channel('pid-config-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracion_pid' }, (payload) => {
        if (payload.new?.activo) {
          const c = payload.new
          setConfig(c)
          setPending({ kp: c.kp, ki: c.ki, kd: c.kd, rampa_vel: c.rampa_vel })
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [supabase])

  useEffect(() => {
    setChanged(
      pending.kp        !== config.kp        ||
      pending.ki        !== config.ki        ||
      pending.kd        !== config.kd        ||
      pending.rampa_vel !== config.rampa_vel
    )
  }, [pending, config])

  const updatePending = (key, val) => setPending((p) => ({ ...p, [key]: val }))

  const guardar = async () => {
    setSaving(true)
    setError('')
    try {
      await supabase.from('configuracion_pid').update({ activo: false }).eq('activo', true)
      const { data, error: err } = await supabase
        .from('configuracion_pid')
        .insert({
          nombre: `Config_${Date.now()}`,
          kp: pending.kp, ki: pending.ki, kd: pending.kd,
          rampa_vel: pending.rampa_vel, activo: true,
        })
        .select()
      if (err) throw err

      const timeStr = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      setLog((l) => [{ time: timeStr, kp: pending.kp, ki: pending.ki, kd: pending.kd, rampa: pending.rampa_vel }, ...l].slice(0, 20))
      setConfig({ ...config, ...pending, id: data?.[0]?.id })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message || 'Error al guardar')
    }
    setSaving(false)
  }

  const resetear = () => setPending({ kp: config.kp, ki: config.ki, kd: config.kd, rampa_vel: config.rampa_vel })

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 28, borderTop: '2px solid #a78bfa',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--sans)', fontSize: 14, letterSpacing: 2, color: 'var(--muted)' }}>
            CONFIGURACIÓN PID EN VIVO
          </h2>
          <div style={{ color: '#374151', fontSize: 11, marginTop: 4 }}>
            El ESP32 carga estos valores cada 5 segundos automáticamente
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {changed && (
            <button onClick={resetear} style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--muted)', borderRadius: 6, padding: '8px 16px',
              fontFamily: 'var(--sans)', fontSize: 13, cursor: 'pointer',
            }}>Descartar</button>
          )}
          <button
            onClick={guardar}
            disabled={!changed || saving}
            style={{
              background: changed ? '#a78bfa22' : '#1f2937',
              border: `1px solid ${changed ? '#a78bfa' : 'var(--border)'}`,
              color: changed ? '#a78bfa' : 'var(--muted)',
              borderRadius: 6, padding: '8px 20px',
              fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600,
              cursor: changed ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s', minWidth: 120,
            }}
          >
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Aplicar cambios'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#ef444422', border: '1px solid #ef4444',
          borderRadius: 6, padding: '8px 14px', marginBottom: 20,
          color: '#ef4444', fontSize: 12,
        }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 48px' }}>
        <div>
          <ParamSlider label="Ganancia Proporcional" symbol="Kp" value={pending.kp} min={0} max={10} step={0.01} color="#60a5fa" description="respuesta inmediata al error" onChange={(v) => updatePending('kp', v)} />
          <ParamSlider label="Ganancia Integral"     symbol="Ki" value={pending.ki} min={0} max={1}  step={0.001} color="#34d399" description="elimina error estacionario"  onChange={(v) => updatePending('ki', v)} />
        </div>
        <div>
          <ParamSlider label="Ganancia Derivativa"   symbol="Kd" value={pending.kd}        min={0} max={5}   step={0.01} color="#f472b6" description="amortigua oscilaciones"      onChange={(v) => updatePending('kd', v)} />
          <ParamSlider label="Velocidad de Rampa"    symbol="R"  value={pending.rampa_vel}  min={5} max={180} step={1}    color="#fbbf24" description="°/s — suavidad del setpoint" onChange={(v) => updatePending('rampa_vel', v)} />
        </div>
      </div>

      {changed && (
        <div style={{
          background: '#a78bfa11', border: '1px solid #a78bfa33',
          borderRadius: 8, padding: '12px 16px', marginTop: 4,
          fontFamily: 'var(--mono)', fontSize: 12,
          display: 'flex', gap: 24, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--muted)' }}>CAMBIOS PENDIENTES →</span>
          {pending.kp        !== config.kp        && <span style={{ color: '#60a5fa' }}>Kp: {config.kp} → <strong>{pending.kp}</strong></span>}
          {pending.ki        !== config.ki        && <span style={{ color: '#34d399' }}>Ki: {config.ki} → <strong>{pending.ki}</strong></span>}
          {pending.kd        !== config.kd        && <span style={{ color: '#f472b6' }}>Kd: {config.kd} → <strong>{pending.kd}</strong></span>}
          {pending.rampa_vel !== config.rampa_vel && <span style={{ color: '#fbbf24' }}>Rampa: {config.rampa_vel} → <strong>{pending.rampa_vel}°/s</strong></span>}
        </div>
      )}

      <ChangeLog entries={log} />
    </div>
  )
}
