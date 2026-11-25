/**
 * Gomoku browser module.
 *
 * Stones are placed on line intersections. This variant deliberately has no
 * next-move hint feature, so no legal-point markers are rendered.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function colorName(color) {
  return color === 'black' ? '黑棋' : '白棋';
}

function playerName(view, userId) {
  return view.players.find((player) => player.userId === userId)?.name || userId;
}

function coordinate(size, index) {
  return `${String.fromCharCode(65 + (index % size))}${Math.floor(index / size) + 1}`;
}

export function render(container, { view, actions, myUserId, onAction }) {
  container.replaceChildren();
  const root = el('div', 'gomoku-shell');
  if (!view || view.schema !== 'gomoku-v1') {
    root.appendChild(el('p', 'muted', '等待五子棋视图…'));
    container.appendChild(root);
    return;
  }

  const spectator = !view.you;
  const myColor = view.you?.color || null;
  const myTurn = view.status === 'playing' && view.turn === myColor;
  const places = new Map(
    (actions || [])
      .filter((action) => action?.type === 'place' && Number.isInteger(action.index))
      .map((action) => [action.index, action]),
  );
  const resign = (actions || []).find((action) => action?.type === 'resign');
  const winning = new Set(view.result?.winningLine || []);

  const header = el('div', 'gomoku-header');
  header.appendChild(el('span', 'gomoku-mode', view.mode === 'seki' ? '彗星座子 · 白先' : '无禁手 · 黑先'));
  header.appendChild(el('span', 'gomoku-you', myColor ? `你执${colorName(myColor)}` : '观战中'));
  header.appendChild(
    el(
      'span',
      'gomoku-turn',
      view.status === 'playing'
        ? `${colorName(view.turn)}回合${myTurn ? ' · 轮到你' : ''}`
        : view.status === 'finished'
          ? '对局结束'
          : '等待双方准备',
    ),
  );
  root.appendChild(header);

  const tools = el('div', 'gomoku-tools');
  if (!spectator && view.status === 'playing' && resign) {
    const resignButton = el('button', 'gomoku-button danger', '认输');
    resignButton.type = 'button';
    resignButton.addEventListener('click', () => {
      if (window.confirm('确定认输吗？')) onAction({ type: 'resign' });
    });
    tools.appendChild(resignButton);
  }
  root.appendChild(tools);

  const size = view.size;
  const pad = 0.65;
  const board = svg('svg', {
    class: `gomoku-board size-${size}`,
    viewBox: `${-pad} ${-pad} ${size - 1 + pad * 2} ${size - 1 + pad * 2}`,
    role: 'grid',
    'aria-label': `${size}×${size} 五子棋棋盘`,
  });
  board.appendChild(svg('rect', {
    class: 'gomoku-bg',
    x: -0.5,
    y: -0.5,
    width: size,
    height: size,
    rx: 0.06,
  }));
  for (let line = 0; line < size; line += 1) {
    board.appendChild(svg('line', {
      class: 'gomoku-grid',
      x1: 0,
      y1: line,
      x2: size - 1,
      y2: line,
    }));
    board.appendChild(svg('line', {
      class: 'gomoku-grid',
      x1: line,
      y1: 0,
      x2: line,
      y2: size - 1,
    }));
  }
  if (size === 15) {
    for (const [x, y] of [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]]) {
      board.appendChild(svg('circle', { class: 'gomoku-star', cx: x, cy: y, r: 0.075 }));
    }
  }

  for (let index = 0; index < size * size; index += 1) {
    const row = Math.floor(index / size);
    const col = index % size;
    const x = col;
    const y = size - 1 - row;
    const value = view.board?.[index] ?? null;
    const placeAction = places.get(index);
    const group = svg('g', {
      class: `gomoku-cell${value ? ` ${value}` : ''}${winning.has(index) ? ' winning' : ''}${view.lastMove?.index === index ? ' last' : ''}${placeAction && myTurn ? ' playable' : ''}`,
      role: 'gridcell',
      'aria-label': `${coordinate(size, index)}${value ? ` ${colorName(value)}` : ''}`,
    });
    const hit = svg('circle', { class: 'gomoku-hit', cx: x, cy: y, r: 0.46 });
    group.appendChild(hit);
    if (value) {
      group.appendChild(svg('circle', { class: `gomoku-stone ${value}`, cx: x, cy: y, r: 0.4 }));
    }
    if (winning.has(index)) {
      group.appendChild(svg('circle', { class: 'gomoku-win-ring', cx: x, cy: y, r: 0.45 }));
    }
    if (view.lastMove?.index === index) {
      group.appendChild(svg('circle', { class: 'gomoku-last-mark', cx: x, cy: y, r: 0.11 }));
    }
    if (placeAction && myTurn) {
      group.setAttribute('tabindex', '0');
      group.addEventListener('click', () => onAction(placeAction));
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onAction(placeAction);
        }
      });
      const title = svg('title');
      title.textContent = coordinate(size, index);
      group.appendChild(title);
    }
    board.appendChild(group);
  }
  root.appendChild(board);

  const info = el('div', 'gomoku-info');
  for (const player of view.players) {
    info.appendChild(
      el('span', `gomoku-player ${player.color}`, `${player.name} · ${colorName(player.color)}`),
    );
  }
  root.appendChild(info);

  if (view.result) {
    const result = el('div', 'gomoku-result');
    const reason = {
      five: '连成五子',
      resign: '认输',
      draw_white_win: '棋盘填满 · 白棋胜',
      draw_both_lose: '棋盘填满 · 双方均败',
    }[view.result.reason] || view.result.reason;
    let winnerText;
    if (view.result.bothLose) {
      winnerText = '双方均败';
    } else if (view.result.winners.length) {
      winnerText = `${view.result.winners.map((id) => playerName(view, id)).join('、')} 获胜`;
    } else {
      winnerText = '平局';
    }
    result.appendChild(el('strong', '', winnerText));
    result.appendChild(el('span', 'muted', reason));
    root.appendChild(result);
  }

  container.appendChild(root);
}
