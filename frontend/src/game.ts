import './styles.css';
import { GameState, HexCoord, HexType } from './types';
import { HexGridRenderer } from './hexGrid';
import { createGame, getGame, extendMycelium, undoMove, resetGame, findPath, createGameFromShareCode, getShareCode, ShareCodeInfo } from './api';
import { coordKey, findPathAStar, PixelCoord } from './hexUtils';

type MessageType = 'info' | 'success' | 'error';

interface GameUI {
  hexContainer: HTMLElement;
  panelContainer: HTMLElement;
}

export class FungiGame {
  private ui: GameUI;
  private gameState: GameState | null = null;
  private hexGrid: HexGridRenderer;
  private selectedLevel = 1;
  private message: { text: string; type: MessageType } | null = null;
  private tooltipEl: HTMLElement | null = null;
  private messageTimeout: any = null;
  private isProcessing = false;
  private previewPathCoord: HexCoord | null = null;
  private customSeedInput = '';
  private shareCodeInput = '';
  private currentShareCode: string | null = null;

  constructor() {
    const hexContainer = document.getElementById('hex-container')!;
    const panelContainer = document.getElementById('panel-container')!;

    this.ui = { hexContainer, panelContainer };

    this.hexGrid = new HexGridRenderer({
      container: hexContainer,
      size: 38,
      onCellClick: (coord) => this.handleCellClick(coord),
      onCellHover: (coord, pixel) => this.handleCellHover(coord, pixel),
    });

    this.initUI();
  }

  private initUI(): void {
    this.renderPanel();
    this.startNewGame(this.selectedLevel);
  }

  private renderPanel(): void {
    this.ui.panelContainer.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'app-header';
    header.innerHTML = `
      <h1>🍄 真菌网络扩增</h1>
      <div class="subtitle">用最少步数连接所有腐木营养源</div>
    `;
    document.getElementById('app-header')!.innerHTML = '';
    document.getElementById('app-header')!.appendChild(header);

    const levelSection = this.createLevelSection();
    this.ui.panelContainer.appendChild(levelSection);

    const seedSection = this.createSeedSection();
    this.ui.panelContainer.appendChild(seedSection);

    if (this.message) {
      const msgBox = document.createElement('div');
      msgBox.className = `message-box message-${this.message.type}`;
      msgBox.textContent = this.message.text;
      this.ui.panelContainer.appendChild(msgBox);
    }

    if (this.gameState) {
      const statsSection = this.createStatsSection();
      this.ui.panelContainer.appendChild(statsSection);

      const controlsSection = this.createControlsSection();
      this.ui.panelContainer.appendChild(controlsSection);

      const legendSection = this.createLegendSection();
      this.ui.panelContainer.appendChild(legendSection);
    }

    if (this.gameState?.status === 'won') {
      this.showWinModal();
    }
  }

  private createLevelSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">选择关卡</div>`;

    const levelSelector = document.createElement('div');
    levelSelector.className = 'level-selector';

    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.className = `level-btn${i === this.selectedLevel ? ' active' : ''}`;
      btn.textContent = String(i);
      btn.onclick = () => {
        this.selectedLevel = i;
        this.startNewGame(i);
      };
      levelSelector.appendChild(btn);
    }

    section.appendChild(levelSelector);
    return section;
  }

  private createSeedSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">地图种子 / 分享码</div>`;

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';

    const seedRow = document.createElement('div');
    seedRow.style.display = 'flex';
    seedRow.style.gap = '8px';

    const seedInput = document.createElement('input');
    seedInput.type = 'text';
    seedInput.placeholder = '输入种子数字（留空随机）';
    seedInput.value = this.customSeedInput;
    seedInput.style.flex = '1';
    seedInput.style.padding = '8px 12px';
    seedInput.style.border = '1px solid #3a3a5a';
    seedInput.style.borderRadius = '8px';
    seedInput.style.background = '#1a1a2e';
    seedInput.style.color = '#e0e0f0';
    seedInput.style.fontSize = '13px';
    seedInput.oninput = (e) => {
      this.customSeedInput = (e.target as HTMLInputElement).value;
    };

    const seedBtn = document.createElement('button');
    seedBtn.className = 'btn btn-secondary';
    seedBtn.textContent = '🎯 按种子创建';
    seedBtn.style.padding = '8px 12px';
    seedBtn.style.whiteSpace = 'nowrap';
    seedBtn.onclick = () => {
      const seed = this.customSeedInput.trim() ? parseInt(this.customSeedInput.trim(), 10) : undefined;
      if (this.customSeedInput.trim() && isNaN(seed!)) {
        this.showMessage('种子必须是有效的数字', 'error');
        return;
      }
      this.startNewGame(this.selectedLevel, seed);
    };

    seedRow.appendChild(seedInput);
    seedRow.appendChild(seedBtn);
    container.appendChild(seedRow);

    const shareRow = document.createElement('div');
    shareRow.style.display = 'flex';
    shareRow.style.gap = '8px';

    const shareInput = document.createElement('input');
    shareInput.type = 'text';
    shareInput.placeholder = '粘贴分享码挑战同一张地图';
    shareInput.value = this.shareCodeInput;
    shareInput.style.flex = '1';
    shareInput.style.padding = '8px 12px';
    shareInput.style.border = '1px solid #3a3a5a';
    shareInput.style.borderRadius = '8px';
    shareInput.style.background = '#1a1a2e';
    shareInput.style.color = '#e0e0f0';
    shareInput.style.fontSize = '13px';
    shareInput.oninput = (e) => {
      this.shareCodeInput = (e.target as HTMLInputElement).value;
    };

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn btn-primary';
    shareBtn.textContent = '🔗 使用分享码';
    shareBtn.style.padding = '8px 12px';
    shareBtn.style.whiteSpace = 'nowrap';
    shareBtn.onclick = () => {
      const code = this.shareCodeInput.trim();
      if (!code) {
        this.showMessage('请输入分享码', 'error');
        return;
      }
      this.startFromShareCode(code);
    };

    shareRow.appendChild(shareInput);
    shareRow.appendChild(shareBtn);
    container.appendChild(shareRow);

    if (this.gameState) {
      const seedInfo = document.createElement('div');
      seedInfo.style.fontSize = '12px';
      seedInfo.style.color = '#8a8a9a';
      seedInfo.style.display = 'flex';
      seedInfo.style.justifyContent = 'space-between';
      seedInfo.style.alignItems = 'center';
      seedInfo.style.padding = '6px 0';
      seedInfo.innerHTML = `<span>🎲 当前种子: <strong style="color: #7ed957;">${this.gameState.seed}</strong></span>`;
      
      const copySeedBtn = document.createElement('button');
      copySeedBtn.className = 'btn btn-secondary';
      copySeedBtn.textContent = '📋 复制种子';
      copySeedBtn.style.padding = '4px 8px';
      copySeedBtn.style.fontSize = '11px';
      copySeedBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(String(this.gameState!.seed));
          this.showMessage('种子已复制到剪贴板', 'success');
        } catch {
          this.showMessage('复制失败，请手动复制', 'error');
        }
      };
      seedInfo.appendChild(copySeedBtn);
      container.appendChild(seedInfo);
    }

    section.appendChild(container);
    return section;
  }

  private createStatsSection(): HTMLElement {
    const section = document.createElement('div');

    section.innerHTML = `<div class="section-title">游戏进度</div>`;

    const grid = document.createElement('div');
    grid.className = 'stats-grid';

    const progress = this.gameState!.nutrients.length > 0
      ? (this.gameState!.connectedNutrients.length / this.gameState!.nutrients.length) * 100
      : 0;

    const stepsRatio = this.gameState!.steps / Math.max(1, this.gameState!.optimalSteps);
    let stepsClass = '';
    if (stepsRatio <= 1.2) stepsClass = '';
    else if (stepsRatio <= 1.5) stepsClass = 'warning';
    else stepsClass = 'danger';

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">当前步数</div>
        <div class="stat-value ${stepsClass}">${this.gameState!.steps}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">最优步数</div>
        <div class="stat-value info">${this.gameState!.optimalSteps}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">营养源</div>
        <div class="stat-value">${this.gameState!.connectedNutrients.length}/${this.gameState!.nutrients.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">关卡</div>
        <div class="stat-value info">${this.gameState!.level}</div>
      </div>
    `;

    section.appendChild(grid);

    const progressWrap = document.createElement('div');
    progressWrap.style.marginBottom = '24px';
    progressWrap.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #8a8a9a; margin-bottom: 4px;">
      <span>连接进度</span>
      <span>${Math.round(progress)}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${progress}%"></div>
    </div>
    `;
    section.appendChild(progressWrap);

    return section;
  }

  private createControlsSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">操作</div>`;

    const controls = document.createElement('div');
    controls.className = 'controls';

    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn btn-secondary';
    undoBtn.innerHTML = '↩️ 撤销上一步';
    undoBtn.disabled = this.gameState!.myceliumCells.length <= 1 || this.isProcessing;
    undoBtn.onclick = () => this.handleUndo();
    controls.appendChild(undoBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-secondary';
    resetBtn.innerHTML = '🔄 重置关卡';
    resetBtn.disabled = this.isProcessing;
    resetBtn.onclick = () => this.handleReset();
    controls.appendChild(resetBtn);

    const newGameBtn = document.createElement('button');
    newGameBtn.className = 'btn btn-primary';
    newGameBtn.innerHTML = '🎮 新游戏';
    newGameBtn.onclick = () => this.startNewGame(this.selectedLevel);
    controls.appendChild(newGameBtn);

    section.appendChild(controls);
    return section;
  }

  private createLegendSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">图例说明</div>`;

    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-color" style="background: #5fa8d3;"></div>
        <div class="legend-text">🏠 菌丝起点（菌落）</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #6ab04c;"></div>
        <div class="legend-text">🍄 菌丝区域</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #c68642;"></div>
        <div class="legend-text">🪵 腐木营养源（需连接）</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #8b0000;"></div>
        <div class="legend-text">☢️ 重金属污染区（禁止）</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #2a2a4a; border: 1px dashed #7ed957;"></div>
        <div class="legend-text">⬜ 可蔓延区域（虚线框）</div>
      </div>
    `;

    section.appendChild(legend);
    return section;
  }

  private async showWinModal(): Promise<void> {
    if (document.querySelector('.win-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'win-modal';

    const steps = this.gameState!.steps;
    const optimal = this.gameState!.optimalSteps;
    const ratio = steps / optimal;

    let stars = 3;
    let starText = '⭐⭐⭐';
    if (ratio > 1.5) {
      stars = 1;
      starText = '⭐☆☆';
    } else if (ratio > 1.2) {
      stars = 2;
      starText = '⭐⭐☆';
    }

    let shareCodeInfo: ShareCodeInfo | null = null;
    let shareCodeLoadError = false;
    try {
      shareCodeInfo = await getShareCode(this.gameState!.id);
      this.currentShareCode = shareCodeInfo.shareCode;
    } catch {
      shareCodeLoadError = true;
    }

    const level = this.gameState!.level;
    const seed = this.gameState!.seed;
    const shareCode = shareCodeInfo?.shareCode || '';

    modal.innerHTML = `
      <div class="win-modal-content">
        <div class="win-title">🎉 连接成功！</div>
        <div style="margin: 16px 0;">${starText.split('').map((s, i) => `<span class="star ${s === '⭐' ? 'filled' : ''}" style="animation-delay: ${i * 0.15}s">${s}</span>`).join('')}</div>
        <div class="win-stats">
          <div class="win-stat">
            <div class="win-stat-label">你的步数</div>
            <div class="win-stat-value">${steps}</div>
          </div>
          <div class="win-stat">
            <div class="win-stat-label">最优步数</div>
            <div class="win-stat-value">${optimal}</div>
          </div>
        </div>
        <div style="color: #8a8a9a; font-size: 13px; margin-bottom: 24px;">
          ${stars === 3 ? '完美！你找到了最优解！' : stars === 2 ? '表现不错，还能更优！' : '再接再厉，寻找更短的路径！'}
        </div>
        
        <div style="background: #1a1a2e; border: 1px solid #3a3a5a; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 600; color: #7ed957; margin-bottom: 10px;">📤 分享这张地图给朋友挑战</div>
          <div style="display: flex; gap: 8px;">
            <input 
              type="text" 
              id="share-code-display" 
              value="${shareCode}" 
              readonly 
              style="flex: 1; padding: 8px 12px; border: 1px solid #3a3a5a; border-radius: 8px; background: #0f0f1e; color: #e0e0f0; font-size: 12px; font-family: monospace;"
            />
            <button 
              class="btn btn-primary" 
              id="copy-share-btn" 
              style="padding: 8px 14px; white-space: nowrap;"
              ${shareCodeLoadError || !shareCode ? 'disabled' : ''}
            >
              📋 复制
            </button>
          </div>
          <div style="font-size: 11px; color: #6a6a8a; margin-top: 8px;">
            💡 种子: <strong style="color: #e0e0f0;">${seed}</strong> • 第 ${level} 关
          </div>
        </div>

        <div style="display: flex; gap: 10px; flex-direction: column;">
          ${this.selectedLevel < 5 ? `<button class="btn btn-primary" id="next-level-btn">🚀 下一关</button>` : ''}
          <button class="btn btn-secondary" id="replay-btn">🔄 再玩一次</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const shareDisplay = modal.querySelector('#share-code-display') as HTMLInputElement;
    const copyShareBtn = modal.querySelector('#copy-share-btn');
    if (copyShareBtn && shareDisplay) {
      copyShareBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(shareDisplay.value);
          const origText = copyShareBtn.textContent;
          copyShareBtn.textContent = '✅ 已复制';
          setTimeout(() => { copyShareBtn.textContent = origText; }, 2000);
        } catch {
          shareDisplay.select();
          document.execCommand('copy');
          const origText = copyShareBtn.textContent;
          copyShareBtn.textContent = '✅ 已复制';
          setTimeout(() => { copyShareBtn.textContent = origText; }, 2000);
        }
      });
    }

    const nextBtn = modal.querySelector('#next-level-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      this.selectedLevel = Math.min(5, this.selectedLevel + 1);
      this.startNewGame(this.selectedLevel);
    });
    }

    const replayBtn = modal.querySelector('#replay-btn')!;
    replayBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      this.startNewGame(this.selectedLevel, this.gameState!.seed);
    });
  }

  private async startNewGame(level: number, seed?: number): Promise<void> {
    this.setProcessing(true);
    this.showMessage(seed !== undefined ? `使用种子 ${seed} 生成地图...` : '正在生成新地图...', 'info');

    try {
      this.gameState = await createGame(level, undefined, seed);
      this.hexGrid.setGameState(this.gameState);
      this.showMessage(seed !== undefined ? `第 ${level} 关开始！种子: ${seed}` : `第 ${level} 关开始！连接所有腐木营养源`, 'success');
      this.renderPanel();
    } catch (e) {
      this.showMessage('创建游戏失败：' + (e instanceof Error ? e.message : '未知错误'), 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private async startFromShareCode(shareCode: string): Promise<void> {
    this.setProcessing(true);
    this.showMessage('正在解析分享码...', 'info');

    try {
      this.gameState = await createGameFromShareCode(shareCode);
      this.selectedLevel = this.gameState.level;
      this.hexGrid.setGameState(this.gameState);
      this.customSeedInput = String(this.gameState.seed);
      this.showMessage(`🎮 挑战第 ${this.gameState.level} 关！种子: ${this.gameState.seed}`, 'success');
      this.renderPanel();
    } catch (e) {
      this.showMessage('分享码无效：' + (e instanceof Error ? e.message : '未知错误'), 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private async handleCellClick(coord: HexCoord): Promise<void> {
    if (this.isProcessing || !this.gameState || this.gameState.status !== 'playing') return;

    const key = coordKey(coord);
    const cell = this.gameState.cells[key];
    if (!cell) return;

    if (cell.type === HexType.POLLUTED) {
      this.showMessage('⚠️ 不能蔓延到重金属污染区！', 'error');
      return;
    }

    this.setProcessing(true);

    try {
      this.gameState = await extendMycelium(this.gameState.id, coord);
      this.hexGrid.setGameState(this.gameState);
      this.hexGrid.showPathPreview(null);
      this.previewPathCoord = null;

      if (this.gameState.status === 'won') {
        this.showMessage('🎊 恭喜！成功连接所有营养源！', 'success');
      } else if (cell.type === HexType.NUTRIENT && cell.nutrientId && this.gameState.connectedNutrients.includes(cell.nutrientId)) {
        this.showMessage('✅ 成功连接一个营养源！', 'success');
      }

      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '操作失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private handleCellHover(coord: HexCoord | null, pixel: PixelCoord | null): void {
    if (!this.gameState) return;

    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }

    if (!coord || !pixel) {
      this.hexGrid.showPathPreview(null);
      this.previewPathCoord = null;
      return;
    }

    const key = coordKey(coord);
    const cell = this.gameState.cells[key];
    if (!cell) return;

    const myceliumSet = new Set(this.gameState.myceliumCells.map(coordKey));
    if (!myceliumSet.has(key)) {
      if (cell.type !== HexType.POLLUTED) {
        const fromCoord = this.gameState.myceliumCells[this.gameState.myceliumCells.length - 1];
        const path = findPathAStar(fromCoord, coord, this.gameState.cells, this.gameState.gridRadius, [HexType.POLLUTED]);
        if (path) {
          this.hexGrid.showPathPreview(path);
          this.previewPathCoord = coord;

          this.tooltipEl = document.createElement('div');
          this.tooltipEl.className = 'hex-tooltip';
          this.tooltipEl.style.left = `${pixel.x}px`;
          this.tooltipEl.style.top = `${pixel.y}px`;
          const cellName = this.getCellDisplayName(cell);
          const reachable = this.hexGrid['reachableKeys']?.has(key) ? '（可直接蔓延）' : '';
          this.tooltipEl.textContent = `${cellName} ${reachable} • 路径长度: ${path.length - 1} 步`;
          document.body.appendChild(this.tooltipEl);
        }
      }
    }
  }

  private getCellDisplayName(cell: any): string {
    switch (cell.type) {
      case HexType.EMPTY: return '空白区域';
      case HexType.NUTRIENT: return '🪵 腐木营养源';
      case HexType.POLLUTED: return '☢️ 污染区';
      case HexType.MYCELIUM: return '🍄 菌丝区';
      case HexType.START: return '🏠 起点菌落';
      default: return '未知';
    }
  }

  private async handleUndo(): Promise<void> {
    if (!this.gameState) return;
    this.setProcessing(true);

    try {
      this.gameState = await undoMove(this.gameState.id);
      this.hexGrid.setGameState(this.gameState);
      this.hexGrid.showPathPreview(null);
      this.showMessage('↩️ 已撤销上一步', 'info');
      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '撤销失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private async handleReset(): Promise<void> {
    if (!this.gameState) return;
    this.setProcessing(true);
    this.showMessage('正在重置...', 'info');

    try {
      this.gameState = await resetGame(this.gameState.id);
      this.hexGrid.setGameState(this.gameState);
      this.hexGrid.showPathPreview(null);
      this.showMessage('🔄 关卡已重置（相同地图）', 'info');
      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '重置失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private showMessage(text: string, type: MessageType = 'info'): void {
    this.message = { text, type };
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }
    this.renderPanel();

    if (!(type === 'success' && this.gameState?.status === 'won')) {
      this.messageTimeout = setTimeout(() => {
        this.message = null;
        this.renderPanel();
      }, 3000);
    }
  }

  private setProcessing(processing: boolean): void {
    this.isProcessing = processing;
    if (processing || this.gameState) {
      this.renderPanel();
    }
  }
}
