/**
 * Gomoku browser module. No hint markers or hint toggle: this variant has no
 * next-move hint feature.
 */

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function colorName(color) {
  return color === 'black' ? '黑棋' : '白棋';
}

function playerName(view, userId) {
  return view.players.find((player) => player.userId === userId)?.name || userId;
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

  const board = el('div', `gomoku-board size-${view.size}`);
  board.setAttribute('role', 'grid');
  const stars = view.size === 15
    ? new Set([3 * 15 + 3, 11 * 15 + 3, 3 * 15 + 11, 11 * 15 + 11, 7 * 15 + 7])
    : new Set();
  for (let index = 0; index < view.size * view.size; index += 1) {
    const value = view.board?.[index] ?? null;
    const placeAction = places.get(index);
    const cell = el(
      'button',
      `gomoku-cell${value ? ` ${value}` : ''}${winning.has(index) ? ' winning' : ''}${view.lastMove?.index === index ? ' last' : ''}`,
    );
    cell.type = 'button';
    cell.setAttribute('role', 'gridcell');
    if (!value && stars.has(index)) cell.classList.add('star');
    if (value) cell.appendChild(el('span', `gomoku-stone ${value}`));
    if (view.lastMove?.index === index) cell.appendChild(el('span', 'gomoku-last-mark'));
    cell.disabled = !placeAction || !myTurn;
    if (placeAction) {
      cell.title = `${String.fromCharCode(65 + (index % view.size))}${Math.floor(index / view.size) + 1}`;
      cell.addEventListener('click', () => onAction(placeAction));
    }
    board.appendChild(cell);
  }
  root.appendChild(board);

  const info = el('div', 'gomoku-info');
  for (const player of view.players) {
    info.appendChild(
      el(
        'span',
        `gomoku-player ${player.color}`,
        `${player.name} · ${colorName(player.color)}`,
      ),
    );
  }
  root.appendChild(info);

  if (view.result) {
    const result = el('div', 'gomoku-result');
    const reason = {
      five: '连成五子',
      resign: '认输',
      draw_white_win: '棋盘填满 · 平局',
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
