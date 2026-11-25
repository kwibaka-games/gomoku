/**
 * Gomoku browser module.
 *
 * Stones are on line intersections. Free/seki modes have no hint UI; the
 * forbidden/RIF modes expose a local hint toggle for Black's forbidden points.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const COLUMN_LETTERS = 'ABCDEFGHJKLMNOP';
let hintsOn = true;
let fifthSelection = [];

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
  // Gomoku coordinates skip I because it is easily confused with 1.
  return `${COLUMN_LETTERS[index % size]}${Math.floor(index / size) + 1}`;
}

function modeName(view) {
  if (view.mode === 'seki') return '彗星座子 · 白先';
  if (view.mode === 'forbidden') return '15×15 · 指定开局 · 黑棋禁手';
  if (view.mode === 'rif') return '15×15 · RIF · 三手交换 · 五手两打';
  return '无禁手 · 黑先';
}

function phaseLabel(view, myColor) {
  if (view.status === 'finished') return '对局结束';
  if (view.status === 'waiting') return '等待双方准备';
  if (view.phase === 'opening') return '指定开局';
  if (view.phase === 'swap') return '三手交换';
  if (view.phase === 'fifth-offer') {
    return myColor === 'black' ? '五手两打 · 请选择两个打点' : '等待黑棋选择两个打点';
  }
  if (view.phase === 'fifth-choose') {
    return myColor === 'white' ? '五手两打 · 请选择一个打点' : '等待白棋选择打点';
  }
  return `${colorName(view.turn)}回合`;
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
  const forbidden = new Set(
    hintsOn && myColor === 'black' && Array.isArray(view.forbidden) ? view.forbidden : [],
  );
  const fifthOptions = new Map(
    (view.fifthOptions || []).map((index) => [index, index]),
  );
  if (view.phase !== 'fifth-offer') fifthSelection = [];
  if (view.phase === 'fifth-offer' && myColor !== 'black') fifthSelection = [];

  const header = el('div', 'gomoku-header');
  header.appendChild(el('span', 'gomoku-mode', modeName(view)));
  header.appendChild(el('span', 'gomoku-you', myColor ? `你执${colorName(myColor)}` : '观战中'));
  header.appendChild(el('span', 'gomoku-turn', phaseLabel(view, myColor)));
  root.appendChild(header);

  const tools = el('div', 'gomoku-tools');
  if (view.mode === 'forbidden' || view.mode === 'rif') {
    if (myColor === 'black') {
      const hintButton = el('button', `gomoku-button${hintsOn ? ' active' : ''}`, `禁手提示：${hintsOn ? '开' : '关'}`);
      hintButton.type = 'button';
      hintButton.title = '只影响你自己的显示，不影响对手';
      hintButton.addEventListener('click', () => {
        hintsOn = !hintsOn;
        render(container, { view, actions, myUserId, onAction });
      });
      tools.appendChild(hintButton);
    } else if (myColor === 'white') {
      const hintButton = el('button', 'gomoku-button', '禁手提示（仅黑棋）');
      hintButton.type = 'button';
      hintButton.disabled = true;
      tools.appendChild(hintButton);
    }
  }
  if (!spectator && (view.phase === 'playing' || view.phase === 'fifth-offer' || view.phase === 'fifth-choose') && resign) {
    const resignButton = el('button', 'gomoku-button danger', '认输');
    resignButton.type = 'button';
    resignButton.addEventListener('click', () => {
      if (window.confirm('确定认输吗？')) onAction({ type: 'resign' });
    });
    tools.appendChild(resignButton);
  }
  root.appendChild(tools);

  if (view.phase === 'opening' && myColor === 'black') {
    const panel = el('div', 'gomoku-opening');
    panel.appendChild(el('span', 'muted', '选择指定开局'));
    const select = el('select', 'gomoku-opening-select');
    for (const name of view.openings || []) {
      const option = el('option', '', name);
      option.value = name;
      select.appendChild(option);
    }
    if (view.openingName) select.value = view.openingName;
    panel.appendChild(select);
    const confirm = el('button', 'gomoku-button primary', '确认开局');
    confirm.type = 'button';
    confirm.addEventListener('click', () => onAction({ type: 'opening', name: select.value }));
    panel.appendChild(confirm);
    root.appendChild(panel);
  } else if (view.phase === 'opening') {
    root.appendChild(el('p', 'muted', '等待黑棋选择指定开局…'));
  } else if (view.openingName) {
    root.appendChild(el('p', 'gomoku-opening-name', `开局：${view.openingName}`));
  }

  if (view.phase === 'swap') {
    const panel = el('div', 'gomoku-opening');
    if (myColor === 'white') {
      panel.appendChild(el('span', 'muted', '是否交换执子？'));
      const swap = el('button', 'gomoku-button primary', '交换执子');
      swap.type = 'button';
      swap.addEventListener('click', () => onAction({ type: 'swap' }));
      const keep = el('button', 'gomoku-button', '保持执白');
      keep.type = 'button';
      keep.addEventListener('click', () => onAction({ type: 'no-swap' }));
      panel.append(swap, keep);
    } else {
      panel.appendChild(el('span', 'muted', '等待白棋决定是否三手交换…'));
    }
    root.appendChild(panel);
  }

  if (view.phase === 'fifth-offer' && myColor === 'black') {
    const panel = el('div', 'gomoku-opening');
    panel.appendChild(el('span', 'muted', `已选 ${fifthSelection.length}/2 个打点`));
    const confirm = el('button', 'gomoku-button primary', '提交两打');
    confirm.type = 'button';
    confirm.disabled = fifthSelection.length !== 2;
    confirm.addEventListener('click', () => onAction({ type: 'fifth-propose', indices: [...fifthSelection] }));
    panel.appendChild(confirm);
    root.appendChild(panel);
  }

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
    board.appendChild(svg('line', { class: 'gomoku-grid', x1: 0, y1: line, x2: size - 1, y2: line }));
    board.appendChild(svg('line', { class: 'gomoku-grid', x1: line, y1: 0, x2: line, y2: size - 1 }));
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
    const isFifthOption = fifthOptions.has(index);
    const canOfferFifth = view.phase === 'fifth-offer' && myColor === 'black' && !value;
    const canChooseFifth = view.phase === 'fifth-choose' && myColor === 'white' && isFifthOption;
    const canPlace = (placeAction && myTurn) || canOfferFifth || canChooseFifth;
    const group = svg('g', {
      class: `gomoku-cell${value ? ` ${value}` : ''}${winning.has(index) ? ' winning' : ''}${view.lastMove?.index === index ? ' last' : ''}${canPlace ? ' playable' : ''}`,
      role: 'gridcell',
      'aria-label': `${coordinate(size, index)}${value ? ` ${colorName(value)}` : ''}`,
    });
    group.appendChild(svg('circle', { class: 'gomoku-hit', cx: x, cy: y, r: 0.46 }));
    if (value) {
      group.appendChild(svg('circle', { class: `gomoku-stone ${value}`, cx: x, cy: y, r: 0.4 }));
    }
    if (winning.has(index)) {
      group.appendChild(svg('circle', { class: 'gomoku-win-ring', cx: x, cy: y, r: 0.45 }));
    }
    if (view.lastMove?.index === index) {
      group.appendChild(svg('circle', { class: 'gomoku-last-mark', cx: x, cy: y, r: 0.11 }));
    }
    if (forbidden.has(index)) {
      const mark = svg('g', { class: 'gomoku-forbidden' });
      mark.appendChild(svg('line', { x1: x - 0.16, y1: y - 0.16, x2: x + 0.16, y2: y + 0.16 }));
      mark.appendChild(svg('line', { x1: x - 0.16, y1: y + 0.16, x2: x + 0.16, y2: y - 0.16 }));
      group.appendChild(mark);
    }
    if (isFifthOption) {
      group.appendChild(svg('circle', { class: 'gomoku-fifth', cx: x, cy: y, r: 0.18 }));
    }
    if (view.phase === 'fifth-offer' && myColor === 'black' && fifthSelection.includes(index)) {
      group.appendChild(svg('circle', { class: 'gomoku-fifth-selected', cx: x, cy: y, r: 0.19 }));
    }
    if (canPlace) {
      group.setAttribute('tabindex', '0');
      const activate = () => {
        if (canOfferFifth) {
          if (fifthSelection.includes(index)) {
            fifthSelection = fifthSelection.filter((valueIndex) => valueIndex !== index);
          } else if (fifthSelection.length < 2) {
            fifthSelection = [...fifthSelection, index];
          }
          render(container, { view, actions, myUserId, onAction });
          return;
        }
        if (canChooseFifth) {
          onAction({ type: 'fifth-choose', index });
          return;
        }
        onAction(placeAction);
      };
      group.addEventListener('click', activate);
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
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
      draw: '棋盘填满 · 平局',
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
