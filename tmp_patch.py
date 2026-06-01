from pathlib import Path
path = Path('src/pages/CortadorDeVideo.tsx')
text = path.read_text(encoding='utf-8')
old1 = 'onClick={() => setPreviewCutId(previewCutId === cut.id ? null : cut.id)}'
new1 = 'onClick={() => setFullscreenPreviewId(fullscreenPreviewId === cut.id ? null : cut.id)}'
print('old1', old1 in text)
text = text.replace(old1, new1)
old2 = "{previewCutId === cut.id ? 'Ocultar vista previa' : 'Ver corte'}"
new2 = "{fullscreenPreviewId === cut.id ? 'Cerrar vista completa' : 'Ver corte'}"
print('old2', old2 in text)
text = text.replace(old2, new2)
start = text.find("                        <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', background: '#0b1220', padding: 10 }}>")
print('start', start)
if start != -1:
    end = text.find('                      )}', start)
    print('end', end)
    if end != -1:
        text = text[:start] + text[end + len('                      )}'):]
        print('removed preview')
old3 = 'setPreviewCutId(null);\n                              setTimeout(() => setPreviewCutId(editedId), 50);'
print('old3', old3 in text)
text = text.replace(old3, 'setFullscreenPreviewId(null);')
path.write_text(text, encoding='utf-8')
print('done')
