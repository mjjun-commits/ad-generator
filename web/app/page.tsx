'use client'

import { useState } from 'react'

type Market = 'JP' | 'US' | 'BR'
type Layout = 'vs_sq' | 'vs_16x9' | 'vs_9x16'

interface VariantRow {
  id: string
  market: Market
  template: string
  mainText: string
  subText: string
  ctaText: string
  bgColor: string
}

const MARKETS: Market[] = ['JP', 'US', 'BR']
const LAYOUTS: { value: Layout; label: string }[] = [
  { value: 'vs_sq', label: 'Square (1:1)' },
  { value: 'vs_16x9', label: 'Landscape (16:9)' },
  { value: 'vs_9x16', label: 'Portrait (9:16)' },
]

const DEFAULT_ROW = (market: Market, index: number): VariantRow => ({
  id: `${market}_variant_${String(index + 1).padStart(3, '0')}`,
  market,
  template: `${market}_vs_sq_BASE`,
  mainText: '',
  subText: '',
  ctaText: '',
  bgColor: '#4A90D9',
})

export default function Home() {
  const [campaign, setCampaign] = useState('')
  const [brief, setBrief] = useState('')
  const [selectedMarkets, setSelectedMarkets] = useState<Market[]>(['JP'])
  const [selectedLayout, setSelectedLayout] = useState<Layout>('vs_sq')
  const [templateSuffix, setTemplateSuffix] = useState('BASE')
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [jsonOutput, setJsonOutput] = useState('')

  const updateTemplate = (layout: Layout, suffix: string) => {
    setVariants(prev => prev.map(v => ({
      ...v,
      template: `${v.market}_${layout}_${suffix}`,
    })))
  }

  const handleLayoutChange = (layout: Layout) => {
    setSelectedLayout(layout)
    updateTemplate(layout, templateSuffix)
  }

  const handleSuffixChange = (suffix: string) => {
    setTemplateSuffix(suffix)
    updateTemplate(selectedLayout, suffix)
  }

  const handleMarketToggle = (market: Market) => {
    setSelectedMarkets(prev =>
      prev.includes(market) ? prev.filter(m => m !== market) : [...prev, market]
    )
  }

  const handleGenerate = async () => {
    if (!brief.trim()) { setError('광고 브리프를 입력해주세요'); return }
    if (selectedMarkets.length === 0) { setError('시장을 하나 이상 선택해주세요'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, markets: selectedMarkets, layout: selectedLayout, templateSuffix }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '생성 실패')
      setVariants(data.variants)
      buildJson(data.variants, campaign || 'campaign')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const buildJson = (rows: VariantRow[], camp: string) => {
    const json = {
      campaign: camp || 'campaign',
      variants: rows.map(v => ({
        id: v.id,
        template: v.template,
        texts: {
          'main-text': v.mainText,
          'sub-text': v.subText,
          'cta-text': v.ctaText,
        },
        bg_color: v.bgColor,
      })),
    }
    setJsonOutput(JSON.stringify(json, null, 2))
  }

  const handleRowChange = (index: number, field: keyof VariantRow, value: string) => {
    const updated = variants.map((v, i) => i === index ? { ...v, [field]: value } : v)
    setVariants(updated)
    buildJson(updated, campaign)
  }

  const addRow = () => {
    const market = selectedMarkets[0] || 'JP'
    const newRow = DEFAULT_ROW(market as Market, variants.length)
    newRow.template = `${market}_${selectedLayout}_${templateSuffix}`
    const updated = [...variants, newRow]
    setVariants(updated)
    buildJson(updated, campaign)
  }

  const removeRow = (index: number) => {
    const updated = variants.filter((_, i) => i !== index)
    setVariants(updated)
    buildJson(updated, campaign)
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
    if (variants.length > 0) buildJson(variants, val)
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Ad Generator</h1>
      <p style={{ color: '#888', marginBottom: 32, fontSize: 13 }}>
        브리프 입력 → Claude가 카피 생성 → variants.json 다운로드
      </p>

      {/* Campaign & Settings */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>1. 캠페인 설정</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <label style={labelStyle}>
            캠페인 이름
            <input
              style={inputStyle}
              value={campaign}
              onChange={e => handleCampaignChange(e.target.value)}
              placeholder="예: template_jp_mar2026"
            />
          </label>
          <label style={labelStyle}>
            템플릿 접미사 (Figma 프레임명)
            <input
              style={inputStyle}
              value={templateSuffix}
              onChange={e => handleSuffixChange(e.target.value)}
              placeholder="예: BASE, BASE_edu, BASE_ver3"
            />
          </label>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>시장 선택</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {MARKETS.map(m => (
              <button
                key={m}
                onClick={() => handleMarketToggle(m)}
                style={{
                  ...chipStyle,
                  background: selectedMarkets.includes(m) ? '#18A0FB' : '#f0f0f0',
                  color: selectedMarkets.includes(m) ? '#fff' : '#333',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>레이아웃</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {LAYOUTS.map(l => (
              <button
                key={l.value}
                onClick={() => handleLayoutChange(l.value)}
                style={{
                  ...chipStyle,
                  background: selectedLayout === l.value ? '#18A0FB' : '#f0f0f0',
                  color: selectedLayout === l.value ? '#fff' : '#333',
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Brief */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>2. 광고 브리프</h2>
        <textarea
          style={{ ...inputStyle, height: 100, resize: 'vertical', fontFamily: 'inherit' }}
          value={brief}
          onChange={e => setBrief(e.target.value)}
          placeholder="예: 미리캔버스 템플릿 기능 홍보. 타깃: 중소기업 마케터. 톤: 친근하고 명확하게. 핵심 메시지: 템플릿으로 작업 효율 향상"
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            marginTop: 12,
            padding: '10px 24px',
            background: loading ? '#ccc' : '#18A0FB',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          {loading ? 'Claude가 카피 생성 중...' : 'AI 카피 자동 생성'}
        </button>
        {error && <p style={{ color: '#c62828', marginTop: 8, fontSize: 13 }}>{error}</p>}
      </section>

      {/* Variant Table */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>3. Variants 편집</h2>
          <button onClick={addRow} style={{ ...chipStyle, background: '#f0f0f0' }}>+ 행 추가</button>
        </div>

        {variants.length === 0 ? (
          <p style={{ color: '#aaa', fontSize: 13 }}>AI 생성 후 여기서 편집할 수 있습니다</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  {['ID', '템플릿', 'Main Text', 'Sub Text', 'CTA', '배경색', ''].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {variants.map((v, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={tdStyle}>
                      <input style={cellInput} value={v.id} onChange={e => handleRowChange(i, 'id', e.target.value)} />
                    </td>
                    <td style={tdStyle}>
                      <input style={cellInput} value={v.template} onChange={e => handleRowChange(i, 'template', e.target.value)} />
                    </td>
                    <td style={tdStyle}>
                      <input style={cellInput} value={v.mainText} onChange={e => handleRowChange(i, 'mainText', e.target.value)} />
                    </td>
                    <td style={tdStyle}>
                      <input style={cellInput} value={v.subText} onChange={e => handleRowChange(i, 'subText', e.target.value)} />
                    </td>
                    <td style={tdStyle}>
                      <input style={cellInput} value={v.ctaText} onChange={e => handleRowChange(i, 'ctaText', e.target.value)} />
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="color" value={v.bgColor} onChange={e => handleRowChange(i, 'bgColor', e.target.value)} style={{ width: 32, height: 28, border: 'none', cursor: 'pointer' }} />
                        <input style={{ ...cellInput, width: 80 }} value={v.bgColor} onChange={e => handleRowChange(i, 'bgColor', e.target.value)} />
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* JSON Output */}
      {jsonOutput && (
        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>4. JSON 출력</h2>
            <button
              onClick={handleDownload}
              style={{ padding: '8px 20px', background: '#18A0FB', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              JSON 다운로드
            </button>
          </div>
          <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 6, overflow: 'auto', fontSize: 12, maxHeight: 400 }}>
            {jsonOutput}
          </pre>
        </section>
      )}
    </div>
  )
}

// Styles
const sectionStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: 24,
  marginBottom: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}
const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  marginBottom: 16,
  marginTop: 0,
}
const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: '#555',
  fontWeight: 500,
}
const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}
const chipStyle: React.CSSProperties = {
  padding: '6px 16px',
  border: 'none',
  borderRadius: 20,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
}
const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 12,
  color: '#555',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  verticalAlign: 'middle',
}
const cellInput: React.CSSProperties = {
  padding: '4px 6px',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 12,
  width: '100%',
  minWidth: 100,
  boxSizing: 'border-box',
}
