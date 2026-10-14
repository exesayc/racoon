import { useEffect, useRef, useState } from 'react';
import { IconCopy, IconTrash, IconCheck } from '../icons.jsx';

const levelOf = (line) => {
  if (/\b(ERROR|FATAL|Exception)\b|^\s+at /.test(line)) return 'error';
  if (/\bWARN\b/.test(line)) return 'warn';
  if (line.startsWith('[Hexrona]')) return 'app';
  return '';
};

export default function Console({ logs, onClear }) {
  const listRef = useRef(null);
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (follow && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [logs, follow]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="console">
      <header className="page-head">
        <div>
          <h2>Konsol</h2>
          <p className="muted">Oyunun çıktısı. Bir sorun olursa buradaki satırlar nedenini gösterir.</p>
        </div>
        <div className="head-actions">
          <button className="ghost-btn" onClick={copy} disabled={!logs.length}>
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />} {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
          <button className="ghost-btn" onClick={onClear} disabled={!logs.length}><IconTrash size={16} /> Temizle</button>
        </div>
      </header>

      <div className="log" ref={listRef} onScroll={onScroll}>
        {logs.length === 0 ? (
          <div className="empty">
            <strong>Henüz çıktı yok</strong>
            <p>Oyunu başlattığında log satırları burada akmaya başlar.</p>
          </div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={`log-line ${levelOf(line)}`}>{line}</div>
          ))
        )}
      </div>
    </section>
  );
}
