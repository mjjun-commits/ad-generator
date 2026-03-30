'use client'

import { useState, useEffect } from 'react'
import { supabase, Campaign } from '@/lib/supabase'

interface TextRow {
  label: string
  mainText: string
  subText: string
  ctaText: string
  bgColor: string
  bgType: 'solid' | 'gradient'
  gradColor1: string
  gradColor2: string
  gradAngle: number
}

interface ScanFrame {
  frame: string
  textLayers: string[]
  selected: boolean
}

const DEFAULT_TEXT_ROW = (index: number): TextRow => ({
  label: `버전 ${String.fromCharCode(65 + index)}`,
  mainText: '',
  subText: '',
  ctaText: '',
  bgColor: '#4A90D9',
  bgType: 'solid',
  gradColor1: '#4A90D9',
  gradColor2: '#7B2FF7',
  gradAngle: 135,
})

export default function Home() {
  const [campaign, setCampaign] = useState('')
  const [brief, setBrief] = useState('')
  const [frameNames, setFrameNames] = useState<string[]>([''])
  const [textRows, setTextRows] = useState<TextRow[]>([DEFAULT_TEXT_ROW(0)])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [jsonOutput, setJsonOutput] = useState('')
  const [savedCampaigns, setSavedCampaigns] = useState<Campaign[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [autoImages, setAutoImages] = useState(false)
  const [layerMain, setLayerMain] = useState('main-text')
  const [layerSub, setLayerSub] = useState('sub-text')
  const [layerCta, setLayerCta] = useState('cta-text')

  // Scan mode state
  const [scanJson, setScanJson] = useState('')
  const [scanFrames, setScanFrames] = useState<ScanFrame[]>([])
  const [scanMode, setScanMode] = useState(false)
  const [scanError, setScanError] = useState('')

  const validFrames = scanMode
    ? scanFrames.filter(f => f.selected).map(f => f.frame)
    : frameNames.filter(f => f.trim() !== '')
  const totalCount = validFrames.length * textRows.length

  // All unique layers across selected (or all) scan frames
  const scanLayerOptions = (() => {
    if (!scanMode || scanFrames.length === 0) return []
    const selected = scanFrames.filter(f => f.selected)
    const src = selected.length > 0 ? selected : scanFrames
    const seen = new Set<string>()
    src.forEach(f => f.textLayers.forEach(l => seen.add(l)))
    return Array.from(seen)
  })()

  useEffect(() => { loadHistory() }, [])

  const loadHistory = async () => {
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setSavedCampaigns(data)
  }

  const buildJson = (
    rows: TextRow[], camp: string, frames = validFrames, ai = autoImages,
    lMain = layerMain, lSub = layerSub, lCta = layerCta
  ) => {
    const variants: object[] = []
    let idx = 1
    for (const frame of frames) {
      for (const row of rows) {
        const texts: Record<string, string> = {}
        if (lMain) texts[lMain] = row.mainText
        if (lSub)  texts[lSub]  = row.subText
        if (lCta)  texts[lCta]  = row.ctaText
        const bgFields = row.bgType === 'gradient'
          ? { bg_gradient: { type: 'linear', angle: row.gradAngle, stops: [{ color: row.gradColor1, position: 0 }, { color: row.gradColor2, position: 1 }] } }
          : { bg_color: row.bgColor }
        variants.push({
          id: `${frame}_${String(idx).padStart(3, '0')}`,
          template: frame,
          texts,
          ...bgFields,
          ...(ai ? { auto_images: true } : {}),
        })
        idx++
      }
    }
    const json = { campaign: camp || 'campaign', variants }
    setJsonOutput(JSON.stringify(json, null, 2))
    return json
  }

  // Parse scan JSON pasted by user
  const handleScanPaste = (raw: string) => {
    setScanJson(raw)
    setScanError('')
    if (!raw.trim()) {
      setScanFrames([])
      return
    }
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('배열 형식이어야 합니다')
      const frames: ScanFrame[] = parsed.map((item: { frame: string; textLayers: string[] }) => ({
        frame: item.frame,
        textLayers: item.textLayers || [],
        selected: true,
      }))
      setScanFrames(frames)
      setScanMode(true)

      // Auto-detect layer names from first frame
      if (frames.length > 0) {
        const allLayers = frames[0].textLayers
        // Try to auto-match common patterns
        const guessMain = allLayers.find(l => /main|headline|title|제목/i.test(l)) || allLayers[0] || ''
        const guessSub = allLayers.find(l => /sub|body|description|설명/i.test(l)) || allLayers[1] || ''
        const guessCta = allLayers.find(l => /cta|button|버튼/i.test(l)) || allLayers[2] || ''
        if (guessMain) setLayerMain(guessMain)
        if (guessSub) setLayerSub(guessSub)
        if (guessCta) setLayerCta(guessCta)
        // Rebuild JSON with new frames and auto-detected layers
        const newFrames = frames.filter(f => f.selected).map(f => f.frame)
        buildJson(textRows, campaign, newFrames, autoImages, guessMain, guessSub, guessCta)
      }
    } catch (e) {
      setScanError('파싱 오류: ' + String(e))
      setScanFrames([])
    }
  }

  const toggleScanFrame = (index: number) => {
    const updated = scanFrames.map((f, i) => i === index ? { ...f, selected: !f.selected } : f)
    setScanFrames(updated)
    const newFrames = updated.filter(f => f.selected).map(f => f.frame)
    buildJson(textRows, campaign, newFrames)
  }

  const selectAllScanFrames = (val: boolean) => {
    const updated = scanFrames.map(f => ({ ...f, selected: val }))
    setScanFrames(updated)
    const newFrames = updated.filter(f => f.selected).map(f => f.frame)
    buildJson(textRows, campaign, newFrames)
  }

  const exitScanMode = () => {
    setScanMode(false)
    setScanJson('')
    setScanFrames([])
    setScanError('')
  }

  const handleFrameChange = (index: number, value: string) => {
    const updated = frameNames.map((f, i) => i === index ? value : f)
    setFrameNames(updated)
    buildJson(textRows, campaign, updated.filter(f => f.trim() !== ''))
  }

  const addFrame = () => setFrameNames(prev => [...prev, ''])

  const removeFrame = (index: number) => {
    const updated = frameNames.filter((_, i) => i !== index)
    setFrameNames(updated.length ? updated : [''])
    buildJson(textRows, campaign, updated.filter(f => f.trim() !== ''))
  }

  const handleGenerate = async () => {
    if (!brief.trim()) { setError('광고 브리프를 입력해주세요'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, markets: ['JP'], layout: 'vs_sq', templateSuffix: 'BASE', variantCount: textRows.length }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '생성 실패')
      const newRows: TextRow[] = data.variants.map((v: { mainText: string; subText: string; ctaText: string; bgColor: string }, i: number) => ({
        label: `버전 ${String.fromCharCode(65 + i)}`,
        mainText: v.mainText,
        subText: v.subText,
        ctaText: v.ctaText,
        bgColor: v.bgColor || '#4A90D9',
      }))
      setTextRows(newRows)
      buildJson(newRows, campaign)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleRowChange = (index: number, field: keyof TextRow, value: string | number) => {
    const updated = textRows.map((r, i) => i === index ? { ...r, [field]: value } : r)
    setTextRows(updated)
    buildJson(updated, campaign)
  }

  const addRow = () => {
    const updated = [...textRows, DEFAULT_TEXT_ROW(textRows.length)]
    setTextRows(updated)
    buildJson(updated, campaign)
  }

  const removeRow = (index: number) => {
    if (textRows.length <= 1) return
    const updated = textRows.filter((_, i) => i !== index)
    setTextRows(updated)
    buildJson(updated, campaign)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const json = buildJson(textRows, campaign)
    const { error: saveError } = await supabase.from('campaigns').insert({
      name: campaign || '이름 없음',
      brief: brief || null,
      variants: json,
    })
    if (saveError) setError('저장 실패: ' + saveError.message)
    else { await loadHistory(); setShowHistory(true) }
    setSaving(false)
  }

  const handleLoadCampaign = (c: Campaign) => {
    const data = c.variants as { campaign: string; variants: object[] }
    setCampaign(data.campaign || c.name)
    setBrief(c.brief || '')
    setJsonOutput(JSON.stringify(data, null, 2))
    setShowHistory(false)
  }

  const handleDownload = () => {
    const blob = new Blob([jsonOutput], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${campaign || 'variants'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Ad Generator</h1>
          <p style={{ color: '#888', margin: 0, fontSize: 13 }}>Figma 프레임 이름 입력 × 텍스트 변형 → variants.json</p>
        </div>
        <button onClick={() => setShowHistory(!showHistory)} style={{ ...chipStyle, background: showHistory ? '#18A0FB' : '#f0f0f0', color: showHistory ? '#fff' : '#333' }}>
          히스토리 {savedCampaigns.length > 0 ? `(${savedCampaigns.length})` : ''}
        </button>
      </div>

      {/* History */}
      {showHistory && (
        <section style={{ ...sectionStyle, marginBottom: 16 }}>
          <h2 style={sectionTitle}>저장된 캠페인</h2>
          {savedCampaigns.length === 0 ? (
            <p style={{ color: '#aaa', fontSize: 13 }}>저장된 캠페인 없음</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {savedCampaigns.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f9f9f9', borderRadius: 6 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                    <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                      {new Date(c.created_at).toLocaleString('ko-KR')}
                      {c.brief ? ` · ${c.brief.slice(0, 50)}...` : ''}
                    </div>
                  </div>
                  <button onClick={() => handleLoadCampaign(c)} style={{ ...chipStyle, background: '#fff', border: '1px solid #ddd', fontSize: 12 }}>불러오기</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 1. 캠페인 이름 */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>1. 캠페인 이름</h2>
        <input
          style={inputStyle}
          value={campaign}
          onChange={e => { setCampaign(e.target.value); buildJson(textRows, e.target.value) }}
          placeholder="예: ir_deck_apr2026"
        />
        <p style={hintStyle}>다운로드되는 JSON 파일명이 됩니다.</p>
      </section>

      {/* 2. 프레임 선택 */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h2 style={{ ...sectionTitle, margin: 0 }}>2. Figma 템플릿 프레임 선택</h2>
            <p style={hintStyle}>스캔 결과를 붙여넣으면 프레임을 체크박스로 선택할 수 있습니다.</p>
          </div>
          {scanMode && (
            <button onClick={exitScanMode} style={{ ...chipStyle, background: '#fee2e2', color: '#c62828', fontSize: 12 }}>
              스캔 모드 해제
            </button>
          )}
        </div>

        {/* Scan paste area */}
        {!scanMode && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', marginBottom: 6 }}>
              Figma 플러그인 스캔 결과 붙여넣기
            </div>
            <textarea
              style={{ ...inputStyle, height: 80, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
              value={scanJson}
              onChange={e => handleScanPaste(e.target.value)}
              placeholder={'Figma 플러그인에서 "프레임 스캔" 버튼 클릭 후 복사된 JSON을 여기에 붙여넣으세요\n예: [{"frame":"JP_vs_sq_BASE","textLayers":["main-text","sub-text","cta-text"]}]'}
            />
            {scanError && <p style={{ color: '#c62828', fontSize: 11, marginTop: 4 }}>{scanError}</p>}
            <div style={{ display: 'flex', alignItems: 'center', margin: '12px 0 8px' }}>
              <div style={{ flex: 1, height: 1, background: '#eee' }} />
              <span style={{ margin: '0 10px', fontSize: 11, color: '#bbb' }}>또는 직접 입력</span>
              <div style={{ flex: 1, height: 1, background: '#eee' }} />
            </div>
          </div>
        )}

        {/* Scan mode: frame checkboxes */}
        {scanMode && scanFrames.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
                프레임 선택 — {scanFrames.filter(f => f.selected).length}/{scanFrames.length}개 선택됨
              </span>
              <button onClick={() => selectAllScanFrames(true)} style={{ ...chipStyle, padding: '3px 10px', fontSize: 11, background: '#f0f0f0' }}>전체 선택</button>
              <button onClick={() => selectAllScanFrames(false)} style={{ ...chipStyle, padding: '3px 10px', fontSize: 11, background: '#f0f0f0' }}>전체 해제</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', padding: '2px 0' }}>
              {scanFrames.map((sf, i) => (
                <label key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                  padding: '8px 12px', borderRadius: 6,
                  background: sf.selected ? '#f0f7ff' : '#fafafa',
                  border: sf.selected ? '1px solid #bfdbfe' : '1px solid #eee',
                  transition: 'all 0.1s',
                }}>
                  <input
                    type="checkbox"
                    checked={sf.selected}
                    onChange={() => toggleScanFrame(i)}
                    style={{ marginTop: 2, cursor: 'pointer', accentColor: '#18A0FB' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: sf.selected ? '#1e40af' : '#666', wordBreak: 'break-all' }}>
                      {sf.frame}
                    </div>
                    {sf.textLayers.length > 0 && (
                      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {sf.textLayers.map((layer, j) => (
                          <span key={j} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: '#e5e7eb', color: '#374151', fontFamily: 'monospace' }}>
                            {layer}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Manual frame input (shown when NOT in scan mode) */}
        {!scanMode && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={addFrame} style={{ ...chipStyle, background: '#f0f0f0' }}>+ 추가</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {frameNames.map((name, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
                    value={name}
                    onChange={e => handleFrameChange(i, e.target.value)}
                    placeholder="예: JP_vs_sq_BASE_edu"
                  />
                  <button onClick={() => removeFrame(i)} style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {validFrames.length > 0 && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0f7ff', borderRadius: 6, fontSize: 12 }}>
            <span style={{ color: '#555', fontWeight: 600 }}>선택된 프레임 {validFrames.length}개: </span>
            {validFrames.map((f, i) => (
              <span key={i} style={{ display: 'inline-block', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 4, margin: '2px 4px 2px 0', fontFamily: 'monospace' }}>{f}</span>
            ))}
          </div>
        )}
      </section>

      {/* 3. 이미지 설정 */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>3. 이미지 설정</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div
            onClick={() => { const next = !autoImages; setAutoImages(next); buildJson(textRows, campaign, validFrames, next) }}
            style={{ width: 44, height: 24, borderRadius: 12, background: autoImages ? '#18A0FB' : '#ccc', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}
          >
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: autoImages ? 23 : 3, transition: 'left 0.2s' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>이미지 자동 매핑 (auto_images)</div>
            <div style={{ ...hintStyle, marginTop: 2 }}>켜면 Figma 플러그인에서 업로드 이미지를 thumb 레이어에 순서대로 자동 매핑</div>
          </div>
        </label>
      </section>

      {/* 4. 텍스트 변형 */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ ...sectionTitle, margin: 0 }}>4. 텍스트 변형</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
              {validFrames.length}개 프레임 × {textRows.length}개 버전 =&nbsp;
              <strong style={{ color: '#18A0FB' }}>총 {totalCount}개 소재</strong>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleGenerate} disabled={loading} style={{ ...chipStyle, background: loading ? '#ccc' : '#6366f1', color: '#fff' }}>
              {loading ? '생성 중...' : 'AI 카피 생성'}
            </button>
            <button onClick={addRow} style={{ ...chipStyle, background: '#f0f0f0' }}>+ 행 추가</button>
          </div>
        </div>

        {/* 브리프 입력 */}
        <div style={{ marginBottom: 12 }}>
          <textarea
            style={{ ...inputStyle, height: 60, resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder="AI 카피 자동 생성용 브리프 (선택사항) — 예: 미리캔버스 IR 덱 템플릿 홍보, 10분 제작 강조"
          />
          {error && <p style={{ color: '#c62828', margin: '4px 0 0', fontSize: 12 }}>{error}</p>}
        </div>

        {/* 레이어명 안내 */}
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fffbeb', borderRadius: 6, fontSize: 12, color: '#78350f' }}>
          <strong>Figma 레이어명 설정</strong>
          {scanMode && scanLayerOptions.length > 0 ? (
            <span> — 스캔된 레이어명 중에서 클릭해서 선택하거나 직접 수정하세요.</span>
          ) : (
            <span> — 헤더를 실제 레이어명으로 수정하세요. 디버그 모드에서 확인한 이름을 그대로 입력하면 됩니다.</span>
          )}
        </div>

        {/* Layer name quick-select chips (scan mode only) */}
        {scanMode && scanLayerOptions.length > 0 && (
          <div style={{ marginBottom: 14, padding: '12px 14px', background: '#f8faff', border: '1px solid #e0e7ff', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, marginBottom: 8 }}>스캔된 레이어 — 클릭하면 해당 컬럼에 자동 입력</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {(['main', 'sub', 'cta'] as const).map((col) => {
                const label = col === 'main' ? 'Main 텍스트' : col === 'sub' ? 'Sub 텍스트' : 'CTA'
                const current = col === 'main' ? layerMain : col === 'sub' ? layerSub : layerCta
                const setter = col === 'main' ? setLayerMain : col === 'sub' ? setLayerSub : setLayerCta
                return (
                  <div key={col}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{label}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {scanLayerOptions.map((layer, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setter(layer)
                            const nm = col === 'main' ? layer : layerMain
                            const ns = col === 'sub' ? layer : layerSub
                            const nc = col === 'cta' ? layer : layerCta
                            buildJson(textRows, campaign, validFrames, autoImages, nm, ns, nc)
                          }}
                          style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
                            border: current === layer ? '2px solid #6366f1' : '1px solid #ddd',
                            background: current === layer ? '#e0e7ff' : '#fff',
                            color: current === layer ? '#3730a3' : '#555',
                            fontWeight: current === layer ? 700 : 400,
                          }}
                        >
                          {layer}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setter('')
                          const nm = col === 'main' ? '' : layerMain
                          const ns = col === 'sub' ? '' : layerSub
                          const nc = col === 'cta' ? '' : layerCta
                          buildJson(textRows, campaign, validFrames, autoImages, nm, ns, nc)
                        }}
                        style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                          border: current === '' ? '2px solid #e11d48' : '1px solid #fecdd3',
                          background: current === '' ? '#ffe4e6' : '#fff',
                          color: '#e11d48',
                        }}
                      >
                        없음
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={thStyle}>버전</th>
                <th style={thStyle}>
                  <input
                    value={layerMain}
                    onChange={e => { setLayerMain(e.target.value); buildJson(textRows, campaign, validFrames, autoImages, e.target.value, layerSub, layerCta) }}
                    style={{ ...headerInput, width: 130 }}
                    title="Figma 텍스트 레이어명"
                  />
                </th>
                <th style={thStyle}>
                  <input
                    value={layerSub}
                    onChange={e => { setLayerSub(e.target.value); buildJson(textRows, campaign, validFrames, autoImages, layerMain, e.target.value, layerCta) }}
                    style={{ ...headerInput, width: 130 }}
                    title="Figma 텍스트 레이어명"
                  />
                </th>
                <th style={thStyle}>
                  <input
                    value={layerCta}
                    onChange={e => { setLayerCta(e.target.value); buildJson(textRows, campaign, validFrames, autoImages, layerMain, layerSub, e.target.value) }}
                    style={{ ...headerInput, width: 100 }}
                    title="Figma 텍스트 레이어명"
                  />
                </th>
                <th style={thStyle}>배경</th>
                <th style={thStyle}></th>
              </tr>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #eee' }}>
                <td colSpan={6} style={{ padding: '2px 12px', fontSize: 11, color: '#aaa' }}>
                  {scanMode ? '↑ 위의 레이어 칩을 클릭하거나 헤더를 직접 수정' : '↑ 헤더 클릭해서 실제 Figma 레이어명으로 수정'}
                </td>
              </tr>
            </thead>
            <tbody>
              {textRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>
                    <input style={{ ...cellInput, width: 70, fontWeight: 600 }} value={row.label} onChange={e => handleRowChange(i, 'label', e.target.value)} />
                  </td>
                  <td style={tdStyle}>
                    <input style={cellInput} value={row.mainText} onChange={e => handleRowChange(i, 'mainText', e.target.value)} placeholder={layerMain || '(비활성)'} disabled={!layerMain} />
                  </td>
                  <td style={tdStyle}>
                    <input style={cellInput} value={row.subText} onChange={e => handleRowChange(i, 'subText', e.target.value)} placeholder={layerSub || '(비활성)'} disabled={!layerSub} />
                  </td>
                  <td style={tdStyle}>
                    <input style={{ ...cellInput, width: 100 }} value={row.ctaText} onChange={e => handleRowChange(i, 'ctaText', e.target.value)} placeholder={layerCta || '(비활성)'} disabled={!layerCta} />
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
                      {/* 단색/그라데이션 토글 */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => { handleRowChange(i, 'bgType', 'solid'); }}
                          style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: row.bgType === 'solid' ? '#18A0FB' : '#f0f0f0', color: row.bgType === 'solid' ? '#fff' : '#555' }}
                        >단색</button>
                        <button
                          onClick={() => { handleRowChange(i, 'bgType', 'gradient'); }}
                          style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: row.bgType === 'gradient' ? '#6366f1' : '#f0f0f0', color: row.bgType === 'gradient' ? '#fff' : '#555' }}
                        >그라데이션</button>
                        {/* 미리보기 */}
                        <div style={{
                          flex: 1, height: 22, borderRadius: 4, marginLeft: 4,
                          background: row.bgType === 'gradient'
                            ? `linear-gradient(${row.gradAngle}deg, ${row.gradColor1}, ${row.gradColor2})`
                            : row.bgColor,
                          border: '1px solid #ddd',
                        }} />
                      </div>

                      {/* 단색 */}
                      {row.bgType === 'solid' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="color" value={row.bgColor} onChange={e => handleRowChange(i, 'bgColor', e.target.value)} style={{ width: 28, height: 24, border: 'none', cursor: 'pointer', borderRadius: 3 }} />
                          <input style={{ ...cellInput, width: 76 }} value={row.bgColor} onChange={e => handleRowChange(i, 'bgColor', e.target.value)} />
                        </div>
                      )}

                      {/* 그라데이션 */}
                      {row.bgType === 'gradient' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="color" value={row.gradColor1} onChange={e => handleRowChange(i, 'gradColor1', e.target.value)} style={{ width: 28, height: 24, border: 'none', cursor: 'pointer', borderRadius: 3 }} />
                            <input style={{ ...cellInput, width: 70 }} value={row.gradColor1} onChange={e => handleRowChange(i, 'gradColor1', e.target.value)} />
                            <span style={{ fontSize: 11, color: '#aaa' }}>→</span>
                            <input type="color" value={row.gradColor2} onChange={e => handleRowChange(i, 'gradColor2', e.target.value)} style={{ width: 28, height: 24, border: 'none', cursor: 'pointer', borderRadius: 3 }} />
                            <input style={{ ...cellInput, width: 70 }} value={row.gradColor2} onChange={e => handleRowChange(i, 'gradColor2', e.target.value)} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>각도</span>
                            <input
                              type="range" min={0} max={360} value={row.gradAngle}
                              onChange={e => handleRowChange(i, 'gradAngle', Number(e.target.value))}
                              style={{ flex: 1 }}
                            />
                            <span style={{ fontSize: 11, color: '#555', minWidth: 30 }}>{row.gradAngle}°</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 16 }} disabled={textRows.length <= 1}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. JSON 출력 */}
      {jsonOutput && (
        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>5. JSON 출력 <span style={{ fontSize: 13, color: '#888', fontWeight: 400 }}>({totalCount}개 소재)</span></h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: saving ? '#ccc' : '#34a853', color: '#fff', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>
                {saving ? '저장 중...' : '저장'}
              </button>
              <button onClick={handleDownload} style={{ padding: '8px 18px', background: '#18A0FB', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                JSON 다운로드
              </button>
            </div>
          </div>
          <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 6, overflow: 'auto', fontSize: 12, maxHeight: 400, margin: 0 }}>
            {jsonOutput}
          </pre>
        </section>
      )}

      {!jsonOutput && validFrames.length > 0 && textRows.some(r => r.mainText) && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <button onClick={() => buildJson(textRows, campaign)} style={{ padding: '10px 32px', background: '#18A0FB', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            JSON 생성 ({totalCount}개 소재)
          </button>
        </div>
      )}
    </div>
  )
}

const sectionStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}
const sectionTitle: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, marginBottom: 8, marginTop: 0,
}
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}
const chipStyle: React.CSSProperties = {
  padding: '6px 16px', border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 500,
}
const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#555', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '6px 8px', verticalAlign: 'middle',
}
const cellInput: React.CSSProperties = {
  padding: '4px 6px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, width: '100%', minWidth: 100, boxSizing: 'border-box',
}
const hintStyle: React.CSSProperties = {
  fontSize: 11, color: '#999', lineHeight: 1.6, margin: '4px 0 0',
}
const headerInput: React.CSSProperties = {
  padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12,
  fontWeight: 600, background: '#fff', outline: 'none', boxSizing: 'border-box',
}
