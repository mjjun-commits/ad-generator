"use strict";
// Ad Generator Plugin
// 기능: variants.json을 읽어 템플릿 프레임 복제 후
//       텍스트 교체, 배경색 변경, thumb 표시/숨김 → OUTPUT 페이지에 배치
figma.showUI(__html__, { width: 320, height: 360 });
// 페이지를 이름으로 찾거나 새로 만들기
function getOrCreatePage(name) {
    const existing = figma.root.children.find(p => p.name === name);
    if (existing)
        return existing;
    const newPage = figma.createPage();
    newPage.name = name;
    return newPage;
}
// 노드 내부에서 레이어명으로 텍스트 노드 재귀 탐색 (최대 7단계)
function findTextNode(node, name, depth = 0) {
    if (depth > 7)
        return null;
    if (node.type === 'TEXT' && node.name === name)
        return node;
    if ('children' in node) {
        for (const child of node.children) {
            const found = findTextNode(child, name, depth + 1);
            if (found)
                return found;
        }
    }
    return null;
}
// 텍스트 노드에 폰트 로드 후 텍스트 교체
async function setTextSafely(textNode, text) {
    const fonts = textNode.getRangeAllFontNames(0, textNode.characters.length);
    for (const font of fonts) {
        await figma.loadFontAsync(font);
    }
    textNode.characters = text;
}
// 메인 실행
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'cancel') {
        figma.closePlugin();
        return;
    }
    if (msg.type !== 'run' || !msg.data)
        return;
    const variants = msg.data.variants;
    let successCount = 0;
    const failedVariants = [];
    // 진단 모드
    if (msg.data.campaign === 'debug') {
        const report = [];
        for (const page of figma.root.children) {
            await page.loadAsync();
            const frames = page.children
                .filter(n => n.type === 'FRAME')
                .map(n => n.name);
            report.push(`[${page.name}]: ${frames.join(', ') || '(프레임 없음)'}`);
        }
        figma.ui.postMessage({ type: 'error', message: report.join('\n') });
        return;
    }
    // OUTPUT 페이지 초기화
    const outputPage = getOrCreatePage('OUTPUT');
    await outputPage.loadAsync();
    for (const child of [...outputPage.children]) {
        child.remove();
    }
    figma.ui.postMessage({ type: 'progress', message: `처리 중... 0 / ${variants.length}` });
    const CHUNK_SIZE = 5;
    const CHUNK_DELAY_MS = 500;
    for (let i = 0; i < variants.length; i += CHUNK_SIZE) {
        const chunk = variants.slice(i, i + CHUNK_SIZE);
        for (const variant of chunk) {
            try {
                // 템플릿 프레임 탐색 (모든 페이지, 중첩 포함)
                let templateFrame;
                for (const page of figma.root.children) {
                    if (page.name === 'OUTPUT')
                        continue;
                    await page.loadAsync();
                    const found = page.findOne(n => n.name === variant.template && n.type === 'FRAME');
                    if (found) {
                        templateFrame = found;
                        break;
                    }
                }
                if (!templateFrame) {
                    failedVariants.push({ id: variant.id, error: `템플릿 "${variant.template}"을 찾을 수 없음` });
                    continue;
                }
                // 프레임 복제 및 배치
                const cloned = templateFrame.clone();
                cloned.name = variant.id;
                outputPage.appendChild(cloned);
                const GAP = 40;
                const COLS = 5;
                const outputFrames = outputPage.children.filter(n => n.type === 'FRAME');
                const index = outputFrames.length - 1;
                cloned.x = (index % COLS) * (cloned.width + GAP);
                cloned.y = Math.floor(index / COLS) * (cloned.height + GAP);
                // 텍스트 교체 (texts 객체의 모든 레이어명 처리)
                if (variant.texts) {
                    for (const [layerName, value] of Object.entries(variant.texts)) {
                        const textNode = findTextNode(cloned, layerName);
                        if (textNode) {
                            await setTextSafely(textNode, value);
                        }
                    }
                }
                // 배경색 변경
                if (variant.bg_color) {
                    const hex = variant.bg_color.replace('#', '');
                    const r = parseInt(hex.substring(0, 2), 16) / 255;
                    const g = parseInt(hex.substring(2, 4), 16) / 255;
                    const b = parseInt(hex.substring(4, 6), 16) / 255;
                    const solidFill = { type: 'SOLID', color: { r, g, b } };
                    // 프레임 자체 배경색
                    if (cloned.fills && cloned.fills.length > 0) {
                        cloned.fills = [solidFill];
                    }
                    // bg-rectangle 또는 background 레이어
                    const bgNode = cloned.findOne(n => n.name === 'bg-rectangle' || n.name === 'background');
                    if (bgNode && 'fills' in bgNode) {
                        try {
                            if ('setFillStyleIdAsync' in bgNode) {
                                await bgNode.setFillStyleIdAsync('');
                            }
                        }
                        catch (_) { /* 스타일 없으면 무시 */ }
                        bgNode.fills = [solidFill];
                    }
                }
                // thumb 표시/숨김 처리
                if (variant.visible_thumbs) {
                    const group33 = cloned.findOne(n => n.name === 'Group 33');
                    if (group33 && 'children' in group33) {
                        for (const child of group33.children) {
                            if (child.name.startsWith('thumb')) {
                                child.visible = variant.visible_thumbs.includes(child.name);
                            }
                        }
                    }
                }
                // 이미지 교체: { "thumb1": "photo1.jpg" }
                if (variant.images && msg.images) {
                    for (const [layerName, filename] of Object.entries(variant.images)) {
                        const imageBytes = msg.images[filename];
                        if (!imageBytes)
                            continue;
                        const targetNode = cloned.findOne(n => n.name === layerName);
                        if (!targetNode || !('fills' in targetNode))
                            continue;
                        const uint8 = new Uint8Array(imageBytes);
                        const figmaImage = figma.createImage(uint8);
                        const imageFill = {
                            type: 'IMAGE',
                            scaleMode: 'FILL',
                            imageHash: figmaImage.hash,
                        };
                        targetNode.fills = [imageFill];
                    }
                }
                successCount++;
                figma.ui.postMessage({
                    type: 'progress',
                    message: `처리 중... ${successCount} / ${variants.length}`
                });
            }
            catch (err) {
                failedVariants.push({ id: variant.id, error: String(err) });
            }
        }
        if (i + CHUNK_SIZE < variants.length) {
            await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));
        }
    }
    await figma.setCurrentPageAsync(outputPage);
    figma.ui.postMessage({
        type: 'done',
        success: successCount,
        failed: failedVariants.length,
        errors: failedVariants,
    });
};
