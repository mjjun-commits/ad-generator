'use client'

import { useState, useEffect } from 'react'
import { supabase, Campaign } from '@/lib/supabase'

interface TextRow {
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

const DEFAULT_TEXT_ROW = (_index: number): TextRow => ({
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
  const [layerMain, setLayerMain] = useState('headline-text')
  const [layerSub, setLayerSub] = useState('sub-text')
  const [layerCta, setLayerCta] = useState('cta-text')
  const [showGuide, setShowGuide] = useState(false)

  // Scan mode state
  const [scanJson, setScanJson] = useState('')
  const [scanFrames, setScanFrames] = useState<ScanFrame[]>([])
  const [scanMode, setScanMode] = useState(false)
  const [scanError, setScanError] = useState('')

  const validFrames = scanMode
    ? scanFrames.filter(f => f.selected).map(f => f.frame)
    : frameNames.filter(f => f.trim() !== '')
  const totalCount = validFrames.length * textRows.length

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

  const handleScanPaste = (raw: string) => {
    setScanJson(raw)
    setScanError('')
    if (!raw.trim()) { setScanFrames([]); return }
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('배열 형식이어야 합니다')
      const frames: ScanFrame[] = parsed.map((item: { frame: string; textLayers: string[] }) => ({
        frame: item.frame, textLayers: item.textLayers || [], selected: true,
      }))
      setScanFrames(frames)
      setScanMode(true)
      if (frames.length > 0) {
        const allLayers = frames[0].textLayers
        const guessMain = allLayers.find(l => /main|headline|title|제목/i.test(l)) || allLayers[0] || ''
        const guessSub = allLayers.find(l => /sub|body|description|설명/i.test(l)) || allLayers[1] || ''
        const guessCta = allLayers.find(l => /cta|button|버튼/i.test(l)) || allLayers[2] || ''
        if (guessMain) setLayerMain(guessMain)
        if (guessSub) setLayerSub(guessSub)
        if (guessCta) setLayerCta(guessCta)
        buildJson(textRows, campaign, frames.filter(f => f.selected).map(f => f.frame), autoImages, guessMain, guessSub, guessCta)
      }
    } catch (e) {
      setScanError('파싱 오류: ' + String(e))
      setScanFrames([])
    }
  }

  const toggleScanFrame = (index: number) => {
    const updated = scanFrames.map((f, i) => i === index ? { ...f, selected: !f.selected } : f)
    setScanFrames(updated)
    buildJson(textRows, campaign, updated.filter(f => f.selected).map(f => f.frame))
  }

  const selectAllScanFrames = (val: boolean) => {
    const updated = scanFrames.map(f => ({ ...f, selected: val }))
    setScanFrames(updated)
    buildJson(textRows, campaign, updated.filter(f => f.selected).map(f => f.frame))
  }

  const exitScanMode = () => { setScanMode(false); setScanJson(''); setScanFrames([]); setScanError('') }

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
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, markets: ['JP'], layout: 'vs_sq', templateSuffix: 'BASE', variantCount: textRows.length }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '생성 실패')
      const newRows: TextRow[] = data.variants.map((v: { mainText: string; subText: string; ctaText: string; bgColor: string }, i: number) => ({
        mainText: v.mainText, subText: v.subText, ctaText: v.ctaText,
        bgColor: v.bgColor || '#4A90D9', bgType: 'solid' as const, gradColor1: '#4A90D9', gradColor2: '#7B2FF7', gradAngle: 135,
      }))
      setTextRows(newRows)
      buildJson(newRows, campaign)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  const handleRowChange = (index: number, field: keyof TextRow, value: string | number) => {
    const updated = textRows.map((r, i) => i === index ? { ...r, [field]: value } : r)
    setTextRows(updated)
    buildJson(updated, campaign)
  }

  const addRow = () => {
    const updated = [...textRows, DEFAULT_TEXT_ROW(textRows.length)]
    setTextRows(updated); buildJson(updated, campaign)
  }

  const removeRow = (index: number) => {
    if (textRows.length <= 1) return
    const updated = textRows.filter((_, i) => i !== index)
    setTextRows(updated); buildJson(updated, campaign)
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    const json = buildJson(textRows, campaign)
    const { error: saveError } = await supabase.from('campaigns').insert({
      name: campaign || '이름 없음', brief: brief || null, variants: json,
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
    a.href = url; a.download = `${campaign || 'variants'}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const APPLE_BLUE = '#0071e3'
  const APPLE_GRAY = '#f5f5f7'
  const TEXT_PRIMARY = '#1d1d1f'
  const TEXT_SECONDARY = '#6e6e73'
  const BORDER = '1px solid rgba(0,0,0,0.08)'

  return (
    <div style={{ minHeight: '100vh', background: APPLE_GRAY, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif' }}>

      {/* Top Nav */}
      <nav style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', borderBottom: BORDER, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 20, height: 20, background: APPLE_BLUE, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="white"><rect x="1" y="1" width="4" height="4" rx="1"/><rect x="7" y="1" width="4" height="4" rx="1"/><rect x="1" y="7" width="4" height="4" rx="1"/><rect x="7" y="7" width="4" height="4" rx="1"/></svg>
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY, letterSpacing: '-0.3px' }}>Ad Generator</span>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            style={{ fontSize: 13, color: showHistory ? APPLE_BLUE : TEXT_SECONDARY, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: '4px 0' }}
          >
            히스토리{savedCampaigns.length > 0 ? ` (${savedCampaigns.length})` : ''}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Page Title */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
            광고 소재 생성
          </h1>
          <p style={{ fontSize: 17, color: TEXT_SECONDARY, margin: 0, fontWeight: 400 }}>
            Figma 프레임 × 텍스트 변형 → variants.json
          </p>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: BORDER }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: TEXT_PRIMARY, margin: '0 0 16px', letterSpacing: '-0.2px' }}>저장된 캠페인</h2>
            {savedCampaigns.length === 0 ? (
              <p style={{ color: TEXT_SECONDARY, fontSize: 14, margin: 0 }}>저장된 캠페인이 없습니다.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {savedCampaigns.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: APPLE_GRAY, borderRadius: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: TEXT_PRIMARY }}>{c.name}</div>
                      <div style={{ color: TEXT_SECONDARY, fontSize: 12, marginTop: 2 }}>
                        {new Date(c.created_at).toLocaleString('ko-KR')}
                        {c.brief ? ` · ${c.brief.slice(0, 40)}...` : ''}
                      </div>
                    </div>
                    <button onClick={() => handleLoadCampaign(c)} style={{ ...appleBtn, background: '#fff', color: APPLE_BLUE, border: `1px solid ${APPLE_BLUE}`, fontSize: 13, padding: '6px 14px' }}>
                      불러오기
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Section 1 — 캠페인 이름 */}
        <div style={card}>
          <SectionLabel num="01" title="캠페인 이름" desc="다운로드되는 JSON 파일명이 됩니다." />
          <input
            style={appleInput}
            value={campaign}
            onChange={e => { setCampaign(e.target.value); buildJson(textRows, e.target.value) }}
            placeholder="예: ir_deck_apr2026"
          />
        </div>

        {/* Section 2 — 프레임 선택 */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <SectionLabel num="02" title="Figma 템플릿 프레임" desc="변형할 Figma 프레임 이름을 정확히 입력하세요." />
            {scanMode && (
              <button onClick={exitScanMode} style={{ ...appleBtn, background: '#fff', color: '#e34850', border: '1px solid #ffd0d3', fontSize: 13, flexShrink: 0 }}>
                스캔 모드 해제
              </button>
            )}
          </div>

          {/* 레이어 가이드 배너 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '14px 18px', marginBottom: 20, borderRadius: 12,
            background: 'linear-gradient(135deg, #f0f4ff 0%, #fafbff 100%)',
            border: '1px solid rgba(0,113,227,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: APPLE_BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="white" strokeWidth="1.5"/>
                  <path d="M8 7v4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="8" cy="5" r="0.75" fill="white"/>
                </svg>
              </div>
              <span style={{ fontSize: 14, color: '#1d1d1f', fontWeight: 500, lineHeight: 1.4 }}>
                프레임 작성 전 프레임 내 레이어가 잘 기입되어 있는지 체크해주세요!
              </span>
            </div>
            <button
              onClick={() => setShowGuide(v => !v)}
              style={{ ...appleBtn, background: showGuide ? APPLE_BLUE : '#fff', color: showGuide ? '#fff' : APPLE_BLUE, border: `1px solid ${APPLE_BLUE}`, fontSize: 13, flexShrink: 0, padding: '8px 16px' }}
            >
              {showGuide ? '가이드 닫기' : '레이어 가이드 보기'}
            </button>
          </div>

          {/* Layer Naming Guide */}
          {showGuide && (
            <div style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden', border: BORDER }}>
              <div style={{ background: TEXT_PRIMARY, color: '#fff', padding: '12px 18px', fontSize: 13, fontWeight: 600, letterSpacing: '-0.1px' }}>
                Figma 레이어 네이밍 규칙
              </div>
              <div style={{ background: '#fff', padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                {[
                  {
                    title: '텍스트 레이어', color: '#e8f0fe', textColor: '#1a56db',
                    items: [
                      { name: 'headline-text', desc: '메인 헤드라인' },
                      { name: 'sub-text', desc: '서브 카피' },
                      { name: 'cta-text', desc: 'CTA 버튼' },
                    ],
                    note: '※ 레이어 이름이 다르면 아래 헤더를 직접 수정',
                  },
                  {
                    title: '이미지 레이어', color: '#fef9e7', textColor: '#9a6c00',
                    items: [
                      { name: 'thumb', desc: '단일 이미지 (1개)' },
                      { name: 'thumb1, thumb2...', desc: '복수 이미지 (자동 매핑)' },
                    ],
                    note: '※ RECTANGLE에 image fill이 있어야 함',
                  },
                  {
                    title: '배경 레이어', color: '#e6f9f0', textColor: '#0a7340',
                    items: [
                      { name: 'bg / BG', desc: '일반적인 배경 도형' },
                      { name: 'background', desc: '영문 전체 이름' },
                      { name: 'bg-rectangle', desc: '기존 형식' },
                    ],
                    note: '※ 없으면 프레임 자체 배경 변경',
                  },
                ].map(group => (
                  <div key={group.title}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{group.title}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {group.items.map(item => (
                        <div key={item.name} style={{ padding: '7px 10px', borderRadius: 8, background: APPLE_GRAY }}>
                          <code style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY, fontFamily: '"SF Mono", "Fira Code", monospace' }}>{item.name}</code>
                          <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 }}>{item.desc}</div>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 8 }}>{group.note}</p>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fffbeb', borderTop: '1px solid #fde68a', padding: '12px 18px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#78350f', marginBottom: 6 }}>프레임 작성 전 체크리스트</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {[
                    'headline-text 레이어 이름 확인',
                    'thumb / thumb1, thumb2... 이름 확인',
                    'bg / background 배경 레이어 확인',
                    '플러그인 스캔으로 실제 레이어명 검증',
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, color: '#78350f' }}>
                      <span style={{ color: '#f59e0b', marginTop: 1 }}>✓</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Scan frame checkboxes */}
          {scanMode && scanFrames.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
                  {scanFrames.filter(f => f.selected).length}/{scanFrames.length}개 선택됨
                </span>
                <button onClick={() => selectAllScanFrames(true)} style={{ ...appleBtn, fontSize: 12, padding: '4px 12px', background: APPLE_GRAY, color: TEXT_PRIMARY, border: BORDER }}>전체 선택</button>
                <button onClick={() => selectAllScanFrames(false)} style={{ ...appleBtn, fontSize: 12, padding: '4px 12px', background: APPLE_GRAY, color: TEXT_PRIMARY, border: BORDER }}>전체 해제</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {scanFrames.map((sf, i) => (
                  <label key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                    padding: '10px 14px', borderRadius: 10,
                    background: sf.selected ? '#e8f0fe' : '#fff',
                    border: sf.selected ? `1px solid ${APPLE_BLUE}` : BORDER,
                    transition: 'all 0.15s',
                  }}>
                    <input type="checkbox" checked={sf.selected} onChange={() => toggleScanFrame(i)} style={{ marginTop: 2, accentColor: APPLE_BLUE }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: '"SF Mono", monospace', fontSize: 13, fontWeight: 600, color: sf.selected ? APPLE_BLUE : TEXT_PRIMARY, wordBreak: 'break-all' }}>{sf.frame}</div>
                      {sf.textLayers.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {sf.textLayers.map((layer, j) => (
                            <span key={j} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(0,0,0,0.06)', color: TEXT_SECONDARY, fontFamily: 'monospace' }}>{layer}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Manual frame input */}
          {!scanMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {frameNames.map((name, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={{ ...appleInput, fontFamily: '"SF Mono", "Fira Code", monospace', fontSize: 13 }}
                    value={name}
                    onChange={e => handleFrameChange(i, e.target.value)}
                    placeholder="예: JP_vs_sq_BASE_edu"
                  />
                  <button onClick={() => removeFrame(i)} style={{ background: 'none', border: 'none', color: '#c7c7cc', cursor: 'pointer', fontSize: 20, lineHeight: 1, flexShrink: 0, padding: '0 4px' }}>×</button>
                </div>
              ))}
              <button onClick={addFrame} style={{ ...appleBtn, background: APPLE_GRAY, color: APPLE_BLUE, border: BORDER, fontSize: 14, padding: '10px', width: '100%', marginTop: 4 }}>
                + 프레임 추가
              </button>
            </div>
          )}

          {validFrames.length > 0 && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#e8f0fe', borderRadius: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: APPLE_BLUE, marginRight: 2 }}>선택 {validFrames.length}개</span>
              {validFrames.map((f, i) => (
                <span key={i} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, background: '#fff', color: TEXT_PRIMARY, fontFamily: 'monospace', border: `1px solid rgba(0,113,227,0.2)` }}>{f}</span>
              ))}
            </div>
          )}
        </div>

        {/* Section 3 — 이미지 설정 */}
        <div style={card}>
          <SectionLabel num="03" title="이미지 설정" desc="업로드한 이미지를 thumb 레이어에 자동 매핑합니다." />
          <div
            onClick={() => { const next = !autoImages; setAutoImages(next); buildJson(textRows, campaign, validFrames, next) }}
            style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', padding: '14px 16px', borderRadius: 12, background: APPLE_GRAY, border: BORDER }}
          >
            <div style={{ position: 'relative', width: 44, height: 26, flexShrink: 0 }}>
              <div style={{ width: 44, height: 26, borderRadius: 13, background: autoImages ? APPLE_BLUE : '#c7c7cc', transition: 'background 0.25s' }} />
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: autoImages ? 20 : 2, transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>이미지 자동 매핑 (auto_images)</div>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>Figma 플러그인에서 업로드한 이미지를 thumb 레이어 순서대로 자동 매핑</div>
            </div>
          </div>
        </div>

        {/* Section 4 — 텍스트 변형 */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <SectionLabel num="04" title="텍스트 변형" desc={undefined} />
              <div style={{ fontSize: 14, color: TEXT_SECONDARY, marginTop: 2 }}>
                {validFrames.length}개 프레임 × {textRows.length}개 버전 =&nbsp;
                <span style={{ color: APPLE_BLUE, fontWeight: 700 }}>총 {totalCount}개 소재</span>
              </div>
            </div>
            <button onClick={addRow} style={{ ...appleBtn, background: APPLE_BLUE, color: '#fff', fontSize: 13, padding: '8px 18px' }}>
              + 버전 추가
            </button>
          </div>

          {/* Layer header hint */}
          <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a', fontSize: 13, color: '#78350f' }}>
            아래 컬럼 헤더(파란 입력란)를 실제 Figma 레이어명으로 수정하세요.
          </div>

          {/* Scan layer quick-select */}
          {scanMode && scanLayerOptions.length > 0 && (
            <div style={{ marginBottom: 16, padding: '14px 16px', background: APPLE_GRAY, borderRadius: 12, border: BORDER }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>스캔된 레이어 선택</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {(['main', 'sub', 'cta'] as const).map((col) => {
                  const label = col === 'main' ? 'Main' : col === 'sub' ? 'Sub' : 'CTA'
                  const current = col === 'main' ? layerMain : col === 'sub' ? layerSub : layerCta
                  const setter = col === 'main' ? setLayerMain : col === 'sub' ? setLayerSub : setLayerCta
                  return (
                    <div key={col}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 6 }}>{label}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {scanLayerOptions.map((layer, i) => (
                          <button key={i} onClick={() => {
                            setter(layer)
                            buildJson(textRows, campaign, validFrames, autoImages,
                              col === 'main' ? layer : layerMain,
                              col === 'sub' ? layer : layerSub,
                              col === 'cta' ? layer : layerCta)
                          }} style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'monospace',
                            border: current === layer ? `2px solid ${APPLE_BLUE}` : BORDER,
                            background: current === layer ? APPLE_BLUE : '#fff',
                            color: current === layer ? '#fff' : TEXT_PRIMARY,
                            fontWeight: current === layer ? 600 : 400,
                          }}>{layer}</button>
                        ))}
                        <button onClick={() => {
                          setter('')
                          buildJson(textRows, campaign, validFrames, autoImages,
                            col === 'main' ? '' : layerMain,
                            col === 'sub' ? '' : layerSub,
                            col === 'cta' ? '' : layerCta)
                        }} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: current === '' ? '2px solid #e34850' : '1px solid #ffd0d3', background: current === '' ? '#e34850' : '#fff', color: current === '' ? '#fff' : '#e34850' }}>없음</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Table */}
          <div style={{ overflowX: 'auto', borderRadius: 12, border: BORDER, background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: BORDER }}>
                  <th style={th}>
                    <div style={{ fontSize: 10, color: TEXT_SECONDARY, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>레이어명 수정 가능</div>
                    <input value={layerMain} onChange={e => { setLayerMain(e.target.value); buildJson(textRows, campaign, validFrames, autoImages, e.target.value, layerSub, layerCta) }} style={layerInput} placeholder="main-text" />
                  </th>
                  <th style={th}>
                    <div style={{ fontSize: 10, color: TEXT_SECONDARY, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>레이어명 수정 가능</div>
                    <input value={layerSub} onChange={e => { setLayerSub(e.target.value); buildJson(textRows, campaign, validFrames, autoImages, layerMain, e.target.value, layerCta) }} style={layerInput} placeholder="sub-text" />
                  </th>
                  <th style={th}>
                    <div style={{ fontSize: 10, color: TEXT_SECONDARY, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>레이어명 수정 가능</div>
                    <input value={layerCta} onChange={e => { setLayerCta(e.target.value); buildJson(textRows, campaign, validFrames, autoImages, layerMain, layerSub, e.target.value) }} style={{ ...layerInput, width: 100 }} placeholder="cta-text" />
                  </th>
                  <th style={{ ...th, minWidth: 220 }}>배경</th>
                  <th style={{ ...th, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {textRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: i < textRows.length - 1 ? BORDER : 'none', transition: 'background 0.1s' }}>
                    <td style={td}><input style={cellIn} value={row.mainText} onChange={e => handleRowChange(i, 'mainText', e.target.value)} placeholder={layerMain || '(비활성)'} disabled={!layerMain} /></td>
                    <td style={td}><input style={cellIn} value={row.subText} onChange={e => handleRowChange(i, 'subText', e.target.value)} placeholder={layerSub || '(비활성)'} disabled={!layerSub} /></td>
                    <td style={td}><input style={{ ...cellIn, width: 110 }} value={row.ctaText} onChange={e => handleRowChange(i, 'ctaText', e.target.value)} placeholder={layerCta || '(비활성)'} disabled={!layerCta} /></td>
                    <td style={td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {/* 미리보기 + 토글 */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 6, flexShrink: 0, border: BORDER,
                            background: row.bgType === 'gradient' ? `linear-gradient(${row.gradAngle}deg, ${row.gradColor1}, ${row.gradColor2})` : row.bgColor,
                          }} />
                          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: BORDER }}>
                            <button onClick={() => handleRowChange(i, 'bgType', 'solid')} style={{ padding: '4px 10px', fontSize: 12, border: 'none', cursor: 'pointer', background: row.bgType === 'solid' ? TEXT_PRIMARY : '#fff', color: row.bgType === 'solid' ? '#fff' : TEXT_SECONDARY }}>단색</button>
                            <button onClick={() => handleRowChange(i, 'bgType', 'gradient')} style={{ padding: '4px 10px', fontSize: 12, border: 'none', cursor: 'pointer', background: row.bgType === 'gradient' ? TEXT_PRIMARY : '#fff', color: row.bgType === 'gradient' ? '#fff' : TEXT_SECONDARY, borderLeft: BORDER }}>그라데이션</button>
                          </div>
                        </div>
                        {/* 단색 */}
                        {row.bgType === 'solid' && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="color" value={row.bgColor} onChange={e => handleRowChange(i, 'bgColor', e.target.value)} style={{ width: 28, height: 28, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0 }} />
                            <input style={{ ...cellIn, width: 80 }} value={row.bgColor} onChange={e => handleRowChange(i, 'bgColor', e.target.value)} />
                          </div>
                        )}
                        {/* 그라데이션 */}
                        {row.bgType === 'gradient' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input type="color" value={row.gradColor1} onChange={e => handleRowChange(i, 'gradColor1', e.target.value)} style={{ width: 28, height: 28, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0 }} />
                              <input style={{ ...cellIn, width: 72 }} value={row.gradColor1} onChange={e => handleRowChange(i, 'gradColor1', e.target.value)} />
                              <span style={{ color: '#c7c7cc', fontSize: 14 }}>→</span>
                              <input type="color" value={row.gradColor2} onChange={e => handleRowChange(i, 'gradColor2', e.target.value)} style={{ width: 28, height: 28, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0 }} />
                              <input style={{ ...cellIn, width: 72 }} value={row.gradColor2} onChange={e => handleRowChange(i, 'gradColor2', e.target.value)} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 11, color: TEXT_SECONDARY, whiteSpace: 'nowrap' }}>각도</span>
                              <input type="range" min={0} max={360} value={row.gradAngle} onChange={e => handleRowChange(i, 'gradAngle', Number(e.target.value))} style={{ flex: 1, accentColor: APPLE_BLUE }} />
                              <span style={{ fontSize: 11, color: TEXT_PRIMARY, minWidth: 34, textAlign: 'right' }}>{row.gradAngle}°</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={() => removeRow(i)} disabled={textRows.length <= 1} style={{ background: 'none', border: 'none', color: '#c7c7cc', cursor: textRows.length <= 1 ? 'default' : 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 5 — JSON 출력 */}
        {jsonOutput && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <SectionLabel num="05" title="JSON 출력" desc={undefined} />
                <div style={{ fontSize: 14, color: TEXT_SECONDARY }}>총 <span style={{ color: APPLE_BLUE, fontWeight: 700 }}>{totalCount}개</span> 소재</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSave} disabled={saving} style={{ ...appleBtn, background: saving ? '#c7c7cc' : APPLE_GRAY, color: TEXT_PRIMARY, border: BORDER, fontSize: 14, padding: '10px 20px' }}>
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button onClick={handleDownload} style={{ ...appleBtn, background: APPLE_BLUE, color: '#fff', fontSize: 14, padding: '10px 20px' }}>
                  JSON 다운로드
                </button>
              </div>
            </div>
            {error && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fff2f2', borderRadius: 10, fontSize: 13, color: '#e34850' }}>{error}</div>}
            <pre style={{ background: '#1c1c1e', color: '#d4d4d4', padding: 20, borderRadius: 12, overflow: 'auto', fontSize: 12, maxHeight: 420, margin: 0, lineHeight: 1.6, fontFamily: '"SF Mono", "Fira Code", monospace' }}>
              {jsonOutput}
            </pre>
          </div>
        )}

        {!jsonOutput && validFrames.length > 0 && textRows.some(r => r.mainText) && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <button onClick={() => buildJson(textRows, campaign)} style={{ ...appleBtn, background: APPLE_BLUE, color: '#fff', fontSize: 16, padding: '14px 40px' }}>
              JSON 생성 — {totalCount}개 소재
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

function SectionLabel({ num, title, desc }: { num: string; title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: desc ? 16 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: desc ? 4 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#0071e3', letterSpacing: '0.5px' }}>{num}</span>
        <h2 style={{ fontSize: 19, fontWeight: 700, color: '#1d1d1f', margin: 0, letterSpacing: '-0.3px' }}>{title}</h2>
      </div>
      {desc && <p style={{ fontSize: 14, color: '#6e6e73', margin: 0 }}>{desc}</p>}
    </div>
  )
}

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 18, padding: 28, marginBottom: 16,
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)',
}
const appleBtn: React.CSSProperties = {
  borderRadius: 980, border: 'none', cursor: 'pointer', fontWeight: 500,
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', transition: 'opacity 0.15s',
  padding: '8px 18px',
}
const appleInput: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)',
  fontSize: 15, color: '#1d1d1f', outline: 'none', boxSizing: 'border-box',
  background: '#fff', fontFamily: '-apple-system, sans-serif',
}
const th: React.CSSProperties = {
  padding: '12px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12,
  color: '#6e6e73', whiteSpace: 'nowrap', background: '#f5f5f7',
}
const td: React.CSSProperties = {
  padding: '10px 14px', verticalAlign: 'middle',
}
const cellIn: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8,
  fontSize: 13, width: '100%', minWidth: 100, boxSizing: 'border-box',
  background: '#f5f5f7', color: '#1d1d1f', outline: 'none',
}
const layerInput: React.CSSProperties = {
  padding: '5px 8px', border: '1.5px solid #0071e3', borderRadius: 6, fontSize: 12,
  fontWeight: 600, background: '#e8f0fe', color: '#0071e3', outline: 'none',
  boxSizing: 'border-box', width: 140, fontFamily: '"SF Mono", monospace',
}
