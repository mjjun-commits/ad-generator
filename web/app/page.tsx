'use client'

import { useState, useEffect } from 'react'
import { supabase, Campaign } from '@/lib/supabase'

type Market = 'JP' | 'US' | 'BR'
type Layout = 'vs_sq' | 'vs_16x9' | 'vs_9x16'

// 텍스트 행 — 템플릿과 분리
interface TextRow {
  label: string      // 버전명 (예: "버전 A")
  mainText: string
  subText: string
  ctaText: string
  bgColor: string
}

const MARKETS: Market[] = ['JP', 'US', 'BR']
const LAYOUTS: { value: Layout; label: string; short: string }[] = [
  { value: 'vs_sq',   label: 'Square (1:1)',    short: 'sq'   },
  { value: 'vs_16x9', label: 'Landscape (16:9)', short: '16x9' },
  { value: 'vs_9x16', label: 'Portrait (9:16)',  short: '9x16' },
]

const DEFAULT_TEXT_ROW = (index: number): TextRow => ({
  label: `버전 ${String.fromCharCode(65 + index)}`,
  mainText: '',
  subText: '',
  ctaText: '',
  bgColor: '#4A90D9',
})

export default function Home() {
  const [campaign, setCampaign] = useState('')
  const [brief, setBrief] = useState('')
  const [selectedMarkets, setSelectedMarkets] = useState<Market[]>(['JP'])
  const [selectedLayouts, setSelectedLayouts] = useState<Layout[]>(['vs_sq'])
  const [templateSuffix, setTemplateSuffix] = useState('BASE')
  const [textRows, setTextRows] = useState<TextRow[]>([DEFAULT_TEXT_ROW(0)])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [jsonOutput, setJsonOutput] = useState('')
  const [savedCampaigns, setSavedCampaigns] = useState<Campaign[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [autoImages, setAutoImages] = useState(false)

  // 생성될 소재 수 계산
  const totalCount = selectedMarkets.length * selectedLayouts.length * textRows.length

  useEffect(() => { loadHistory() }, [])

  const loadHistory = async () => {
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setSavedCampaigns(data)
  }

  // 레이아웃 토글 (다중 선택)
  const handleLayoutToggle = (layout: Layout) => {
    setSelectedLayouts(prev =>
      prev.includes(layout) ? prev.filter(l => l !== layout) : [...prev, layout]
    )
  }

  const handleMarketToggle = (market: Market) => {
    setSelectedMarkets(prev =>
      prev.includes(market) ? prev.filter(m => m !== market) : [...prev, market]
    )
  }

  // 크로스 프로덕트로 JSON 생성: market × layout × textRow
  const buildJson = (rows: TextRow[], camp: string, ai = autoImages, markets = selectedMarkets, layouts = selectedLayouts, suffix = templateSuffix) => {
    const variants: object[] = []
    let idx = 1
    for (const market of markets) {
      for (const layout of layouts) {
        const layoutShort = LAYOUTS.find(l => l.value === layout)?.short || layout
        for (const row of rows) {
          variants.push({
            id: `${market}_${layoutShort}_${String(idx).padStart(3, '0')}`,
            template: `${market}_${layout}_${suffix}`,
            texts: {
              'main-text': row.mainText,
              'sub-text': row.subText,
              'cta-text': row.ctaText,
            },
            bg_color: row.bgColor,
            ...(ai ? { auto_images: true } : {}),
          })
          idx++
        }
      }
    }
    const json = { campaign: camp || 'campaign', variants }
    setJsonOutput(JSON.stringify(json, null, 2))
    return json
  }

  // Claude로 텍스트 자동 생성
  const handleGenerate = async () => {
    if (!brief.trim()) { setError('광고 브리프를 입력해주세요'); return }
    if (selectedMarkets.length === 0) { setError('시장을 선택해주세요'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          markets: selectedMarkets,
          layout: selectedLayouts[0],
          templateSuffix,
          variantCount: textRows.length,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '생성 실패')
      // Claude 응답을 textRow 형식으로 변환 (시장별로 첫 번째 시장 기준)
      const newRows: TextRow[] = data.variants
        .filter((v: { market: string }) => v.market === selectedMarkets[0])
        .map((v: { mainText: string; subText: string; ctaText: string; bgColor: string }, i: number) => ({
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

  const handleRowChange = (index: number, field: keyof TextRow, value: string) => {
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
    const data = c.variants as { campaign: string; variants: Array<{
      id: string; template: string;
      texts: { 'main-text': string; 'sub-text': string; 'cta-text': string };
      bg_color: string;
    }> }
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

  const handleCampaignChange = (val: string) => {
    setCampaign(val)
    buildJson(textRows, val)
  }

  const handleSuffixChange = (val: string) => {
    setTemplateSuffix(val)
    buildJson(textRows, campaign, autoImages, selectedMarkets, selectedLayouts, val)
  }

  // 선택된 템플릿 목록 미리보기
  const templatePreviews: string[] = []
  for (const market of selectedMarkets) {
    for (const layout of selectedLayouts) {
      templatePreviews.push(`${market}_${layout}_${templateSuffix}`)
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Ad Generator</h1>
          <p style={{ color: '#888', margin: 0, fontSize: 13 }}>템플릿 × 텍스트 행 크로스 프로덕트 → variants.json</p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{ ...chipStyle, background: showHistory ? '#18A0FB' : '#f0f0f0', color: showHistory ? '#fff' : '#333' }}
        >
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
                      {c.brief ? ` · ${c.brief.slice(0, 40)}...` : ''}
                    </div>
                  </div>
                  <button onClick={() => handleLoadCampaign(c)} style={{ ...chipStyle, background: '#fff', border: '1px solid #ddd', fontSize: 12 }}>
                    불러오기
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 1. 캠페인 설정 */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>1. 캠페인 설정</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <label style={labelStyle}>
            캠페인 이름
            <input style={inputStyle} value={campaign} onChange={e => handleCampaignChange(e.target.value)} placeholder="예: template_jp_mar2026" />
            <span style={hintStyle}>다운로드되는 JSON 파일명이 됩니다. 날짜나 주제로 구분하면 편해요.<br />예: <code style={codeStyle}>ir_deck_jp_apr2026</code></span>
          </label>
          <label style={labelStyle}>
            템플릿 접미사
            <input style={inputStyle} value={templateSuffix} onChange={e => handleSuffixChange(e.target.value)} placeholder="예: BASE, BASE_edu, BASE_ver3" />
            <span style={hintStyle}>Figma에서 템플릿 프레임 이름의 맨 끝 부분입니다.<br />프레임명이 <code style={codeStyle}>JP_vs_sq_BASE_edu</code>라면 → <code style={codeStyle}>BASE_edu</code></span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={labelStyle}>시장 선택 (복수 선택)</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {MARKETS.map(m => (
                <button key={m} onClick={() => handleMarketToggle(m)} style={{ ...chipStyle, background: selectedMarkets.includes(m) ? '#18A0FB' : '#f0f0f0', color: selectedMarkets.includes(m) ? '#fff' : '#333' }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={labelStyle}>레이아웃 (복수 선택)</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {LAYOUTS.map(l => (
                <button key={l.value} onClick={() => handleLayoutToggle(l.value)} style={{ ...chipStyle, background: selectedLayouts.includes(l.value) ? '#18A0FB' : '#f0f0f0', color: selectedLayouts.includes(l.value) ? '#fff' : '#333' }}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 템플릿 미리보기 */}
        <div style={{ marginTop: 16, padding: '10px 14px', background: '#f0f7ff', borderRadius: 6, fontSize: 12 }}>
          <span style={{ color: '#555', fontWeight: 600 }}>생성될 Figma 템플릿: </span>
          {templatePreviews.map((t, i) => (
            <span key={i} style={{ display: 'inline-block', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 4, margin: '2px 4px 2px 0', fontFamily: 'monospace' }}>{t}</span>
          ))}
        </div>
      </section>

      {/* 2. 이미지 설정 */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>2. 이미지 설정</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div
            onClick={() => { const next = !autoImages; setAutoImages(next); buildJson(textRows, campaign, next) }}
            style={{ width: 44, height: 24, borderRadius: 12, background: autoImages ? '#18A0FB' : '#ccc', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}
          >
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: autoImages ? 23 : 3, transition: 'left 0.2s' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>이미지 자동 매핑 (auto_images)</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              켜면 Figma 플러그인에서 업로드 이미지를 thumb 레이어에 순서대로 자동 매핑
            </div>
          </div>
        </label>
      </section>

      {/* 3. 광고 브리프 */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>3. 광고 브리프 (선택사항)</h2>
        <textarea
          style={{ ...inputStyle, height: 80, resize: 'vertical', fontFamily: 'inherit' }}
          value={brief}
          onChange={e => setBrief(e.target.value)}
          placeholder="예: 미리캔버스 IR 덱 템플릿 홍보. 타깃: 중소기업 마케터. 핵심 메시지: 10분 만에 완성"
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{ marginTop: 10, padding: '9px 20px', background: loading ? '#ccc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600 }}
        >
          {loading ? 'Claude가 카피 생성 중...' : 'AI 카피 자동 생성'}
        </button>
        {error && <p style={{ color: '#c62828', marginTop: 8, fontSize: 13 }}>{error}</p>}
      </section>

      {/* 4. 텍스트 변형 행 */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ ...sectionTitle, margin: 0 }}>4. 텍스트 변형</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#aaa' }}>버전명은 내부 구분용 — JSON에는 포함되지 않아요</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
              {textRows.length}개 텍스트 버전 × {selectedLayouts.length}개 사이즈{selectedMarkets.length > 1 ? ` × ${selectedMarkets.length}개 시장` : ''} =&nbsp;
              <strong style={{ color: '#18A0FB' }}>총 {totalCount}개 소재</strong>
            </p>
          </div>
          <button onClick={addRow} style={{ ...chipStyle, background: '#f0f0f0' }}>+ 행 추가</button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                {['버전', 'Main Text', 'Sub Text', 'CTA', '배경색', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {textRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>
                    <input style={{ ...cellInput, width: 70, fontWeight: 600 }} value={row.label} onChange={e => handleRowChange(i, 'label', e.target.value)} />
                  </td>
                  <td style={tdStyle}>
                    <input style={cellInput} value={row.mainText} onChange={e => handleRowChange(i, 'mainText', e.target.value)} placeholder="메인 카피" />
                  </td>
                  <td style={tdStyle}>
                    <input style={cellInput} value={row.subText} onChange={e => handleRowChange(i, 'subText', e.target.value)} placeholder="서브 카피" />
                  </td>
                  <td style={tdStyle}>
                    <input style={{ ...cellInput, width: 100 }} value={row.ctaText} onChange={e => handleRowChange(i, 'ctaText', e.target.value)} placeholder="CTA" />
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="color" value={row.bgColor} onChange={e => handleRowChange(i, 'bgColor', e.target.value)} style={{ width: 32, height: 28, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
                      <input style={{ ...cellInput, width: 76 }} value={row.bgColor} onChange={e => handleRowChange(i, 'bgColor', e.target.value)} />
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

        {/* 크로스 프로덕트 미리보기 */}
        <div style={{ marginTop: 14, padding: '10px 14px', background: '#f9f9f9', borderRadius: 6, fontSize: 12, color: '#666' }}>
          <strong>생성 예시:</strong>
          {selectedMarkets.slice(0, 1).flatMap(market =>
            selectedLayouts.slice(0, 2).flatMap((layout, li) =>
              textRows.slice(0, 2).map((row, ri) => {
                const layoutShort = LAYOUTS.find(l => l.value === layout)?.short || layout
                const idx = li * textRows.length + ri + 1
                return (
                  <span key={`${market}-${layout}-${ri}`} style={{ display: 'inline-block', margin: '2px 4px 2px 0', background: '#fff', border: '1px solid #e0e0e0', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace' }}>
                    {market}_{layoutShort}_{String(idx).padStart(3, '0')} → {market}_{layout}_{templateSuffix}
                  </span>
                )
              })
            )
          )}
          {totalCount > 4 && <span style={{ color: '#aaa' }}> ... 외 {totalCount - 4}개</span>}
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

      {/* JSON 미리보기 없을 때 생성 버튼 */}
      {!jsonOutput && textRows.some(r => r.mainText) && (
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
  fontSize: 15, fontWeight: 600, marginBottom: 16, marginTop: 0,
}
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#555', fontWeight: 500,
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
  fontSize: 11, color: '#999', lineHeight: 1.5, fontWeight: 400,
}
const codeStyle: React.CSSProperties = {
  background: '#f0f0f0', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace', fontSize: 11, color: '#555',
}
