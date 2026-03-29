import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MARKET_LANG = {
    JP: '일본어 (Japanese)',
    US: '영어 (English)',
    BR: '포르투갈어-브라질 (Portuguese-BR)',
};
export async function POST(req) {
    const { brief, markets, layout, templateSuffix } = await req.json();
    if (!brief || !markets?.length) {
        return NextResponse.json({ error: '브리프와 시장을 입력해주세요' }, { status: 400 });
    }
    const marketList = markets.map(m => `- ${m}: ${MARKET_LANG[m] || m}`).join('\n');
    const prompt = `당신은 글로벌 광고 카피라이터입니다. 아래 브리프를 바탕으로 각 시장별 광고 카피를 생성해주세요.

브리프:
${brief}

대상 시장:
${marketList}

각 시장마다 다음 형식의 JSON 배열을 생성하세요. 반드시 valid JSON만 출력하고 다른 텍스트는 포함하지 마세요.

[
  {
    "market": "JP",
    "id": "JP_variant_001",
    "template": "JP_${layout}_${templateSuffix}",
    "mainText": "메인 카피 (25자 이내, 해당 언어로)",
    "subText": "서브 카피 (30자 이내, 해당 언어로)",
    "ctaText": "CTA 버튼 텍스트 (10자 이내, 해당 언어로)",
    "bgColor": "#4A90D9"
  }
]

규칙:
- mainText: 핵심 가치를 임팩트 있게 (25자 이내)
- subText: 부가 설명이나 혜택 (30자 이내)
- ctaText: 행동 유도 (10자 이내)
- bgColor: 브랜드 톤에 맞는 HEX 색상
- 각 시장의 문화와 언어에 맞게 현지화
- id 형식: {MARKET}_variant_001, {MARKET}_variant_002 ...
- template 형식: {MARKET}_${layout}_${templateSuffix} (그대로 사용)
- 반드시 JSON 배열만 출력 (설명 없이)`;
    try {
        const message = await client.messages.create({
            model: 'claude-opus-4-6',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }],
        });
        const raw = message.content[0].text.trim();
        // JSON 파싱 (코드블록 제거)
        const cleaned = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ variants: parsed });
    }
    catch (e) {
        console.error('Claude API error:', e);
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
