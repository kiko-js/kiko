/** @jsxImportSource @kikojs/dom */
const card = (
  <div class="card">
    {/* 默认 scoped：选择器改写并限定到最近祖先元素（该 div 获得 data-kiko-vN） */}
    <style>
      {`.card { border: 1px solid #232838; border-radius: 8px; padding: 16px; }
       .title { font-weight: 700; }
       & .badge { color: var(--brand); }
       @media (max-width: 600px) { .card { padding: 8px; } }`}
    </style>
    <p class="title">kiko</p>
  </div>
)

// global：跳过选择器改写，直接全局注入
const globalStyle = <style global>{`body { background: #0b0d10; }`}</style>
