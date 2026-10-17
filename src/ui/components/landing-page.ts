/**
 * World-Class Landing Page Component for veditor
 * Features Obsidian OLED aesthetic, interactive dropzone, folder categorization,
 * custom color/icon folders, and recent file management.
 */

import {
  getRecentDocuments,
  getFolders,
  saveFolder,
  deleteFolder,
  assignDocToFolder,
  deleteRecentDocument
} from '../../io/storage';
import { generateSamplePDF } from '../../io/sample-pdf';
import { buildNotebookPdf } from '../../io/notebook';
import { getIconSvg } from '../../utils/icons';
import { PDFFolder, RecentDocItem, NotebookSpec } from '../../core/types';
import { NotebookDialogComponent } from './notebook-dialog';

export interface LandingPageCallbacks {
  onOpenFile: () => void;
  /** `notebook` marks the bytes as a generated notebook that can be restyled. */
  onOpenBytes: (name: string, bytes: Uint8Array, notebook?: NotebookSpec) => Promise<void>;
  onOpenRecent: (docId: string) => Promise<void>;
}

export class LandingPageComponent {
  private _container: HTMLElement;
  private _callbacks: LandingPageCallbacks;
  private _activeFolderId: string = 'all'; // 'all', 'uncategorized', or folder.id
  private _folders: PDFFolder[] = [];
  private _recentDocs: RecentDocItem[] = [];
  private _showCreateFolderModal: boolean = false;
  private _selectedFolderColor: string = '#6366f1';
  private _selectedFolderIcon: string = 'folder';

  constructor(container: HTMLElement, callbacks: LandingPageCallbacks) {
    this._container = container;
    this._callbacks = callbacks;
  }

  public async render(): Promise<void> {
    try {
      this._folders = await getFolders();
      this._recentDocs = await getRecentDocuments();
    } catch (_) {}

    this.ensureShellMounted();
    this.updateLibraryDOM();
    this.updateFolderModalDOM();
  }

  /**
   * Mounts the static landing page shell (.landing-intro, .features-grid,
   * .shortcuts-sheet) ONCE so entry animations never replay when folders or
   * recent files are updated or deleted.
   */
  private ensureShellMounted(): void {
    if (this._container.querySelector('.landing-container')) {
      return;
    }

    this._container.innerHTML = `
      <div class="landing-container">
        <div class="landing-intro">
          <!-- Hero Section -->
          <div class="landing-hero">
            <div class="landing-badge">
              ${getIconSvg('shieldCheck', 14)}
              Private by design • Works offline
            </div>
            <h1 class="landing-title">Your PDFs.<br><span>Your ideas.</span></h1>
            <p class="landing-subtitle">
              Read, annotate, sign, and organize documents in a focused workspace built for pen, mouse, and touch.
            </p>
            <div class="landing-feature-list" aria-label="Key features">
              <span>${getIconSvg('zap', 14)} Fast local rendering</span>
              <span>${getIconSvg('pen', 14)} Pressure-sensitive ink</span>
              <span>${getIconSvg('shieldCheck', 14)} No uploads</span>
            </div>
          </div>

          <!-- Interactive Dropzone & Action Center -->
          <div class="landing-dropzone" id="landing-dropzone">
            <div class="dropzone-icon-wrapper">
              ${getIconSvg('fileText', 28)}
              <span class="dropzone-icon-plus">${getIconSvg('plus', 12, 2.5)}</span>
            </div>
            <div class="dropzone-prompt">Open a PDF to get started</div>
            <div class="dropzone-hint">Drop a file here or choose one from your device</div>
            <div class="dropzone-actions" id="dropzone-actions-group">
              <button class="primary-btn is-lg" id="landing-open-btn">
                ${getIconSvg('folder', 16)}
                Choose PDF
              </button>

              <button class="secondary-btn is-lg" id="landing-sample-btn" title="Try veditor immediately with an interactive sample PDF">
                ${getIconSvg('sparkles', 16)}
                Try sample
              </button>

              <button class="secondary-btn is-lg" id="landing-notebook-btn" title="Create a fresh lined notebook">
                ${getIconSvg('pen', 16)}
                New notebook
              </button>
            </div>
            <div class="dropzone-privacy">
              ${getIconSvg('shieldCheck', 12)}
              Files never leave this device
            </div>
          </div>
        </div>

        <!-- Recent Documents & Category Shelf -->
        <div class="landing-section">
          <div class="landing-section-header">
            <div class="landing-section-title">
              <span class="landing-section-icon">${getIconSvg('folder', 17)}</span>
              <div>
                <span>Your library</span>
                <small>Pick up where you left off</small>
              </div>
            </div>
          </div>

          <div id="landing-library-body"></div>
        </div>

        <!-- Create Folder Modal Slot -->
        <div id="landing-folder-modal-slot"></div>

        <!-- Feature Showcase -->
        <div class="features-grid">
          <div class="feature-box">
            <div class="feature-icon-badge" style="background:rgba(99,102,241,0.15); color:#818cf8;">
              ${getIconSvg('pen', 22)}
            </div>
            <div class="feature-box-title">Apple Pencil & Stylus Support</div>
            <p class="feature-box-desc">Sub-pixel coalesced pointer events, natural tilt sensitivity, cubic Hermite spline smoothing, and adjustable pressure response curves.</p>
          </div>

          <div class="feature-box">
            <div class="feature-icon-badge" style="background:rgba(16,185,129,0.15); color:#34d399;">
              ${getIconSvg('zap', 22)}
            </div>
            <div class="feature-box-title">Zero-Flicker Double Buffering</div>
            <p class="feature-box-desc">Offscreen canvas rendering pipeline delivers silky-smooth continuous scrolling and instant page switching across 500+ page books.</p>
          </div>

          <div class="feature-box">
            <div class="feature-icon-badge" style="background:rgba(244,114,182,0.15); color:#f472b6;">
              ${getIconSvg('eraser', 22)}
            </div>
            <div class="feature-box-title">Pixel & Segment Eraser</div>
            <p class="feature-box-desc">Choose between whole Stroke Erasing, Object Erasing, or surgical Pixel Slicing that divides ink strokes at exact contact points.</p>
          </div>

          <div class="feature-box">
            <div class="feature-icon-badge" style="background:rgba(59,130,246,0.15); color:#60a5fa;">
              ${getIconSvg('folder', 22)}
            </div>
            <div class="feature-box-title">100% Private & Offline</div>
            <p class="feature-box-desc">Runs entirely inside your browser sandbox. No server uploads, no analytics, no external tracking. Your documents never leave your machine.</p>
          </div>

          <div class="feature-box">
            <div class="feature-icon-badge" style="background:rgba(245,158,11,0.15); color:#fbbf24;">
              ${getIconSvg('stamp', 22)}
            </div>
            <div class="feature-box-title">Vector-Perfect Export</div>
            <p class="feature-box-desc">Export annotated PDFs with native vector streams. Your notes and drawings stay razor-sharp when printed or zoomed on high-resolution screens.</p>
          </div>

          <div class="feature-box">
            <div class="feature-icon-badge" style="background:rgba(139,92,246,0.15); color:#a78bfa;">
              ${getIconSvg('command', 22)}
            </div>
            <div class="feature-box-title">Keyboard-First Flow</div>
            <p class="feature-box-desc">Blazing-fast single-key shortcuts for all tools, quick zoom presets, full Undo/Redo history, and instant command palette.</p>
          </div>
        </div>

        <!-- Shortcuts Quick Cheat Sheet -->
        <div class="shortcuts-sheet">
          <div style="font-weight: 700; font-size: 14px; color: var(--text-primary); margin-bottom: 8px;">
            Keyboard Shortcuts Cheat Sheet
          </div>
          <div class="shortcuts-sheet-grid">
            <div class="shortcut-item"><span>Pen</span> <kbd class="shortcut-kbd">P</kbd></div>
            <div class="shortcut-item"><span>Highlighter</span> <kbd class="shortcut-kbd">H</kbd></div>
            <div class="shortcut-item"><span>Eraser</span> <kbd class="shortcut-kbd">E</kbd></div>
            <div class="shortcut-item"><span>Select</span> <kbd class="shortcut-kbd">V</kbd></div>
            <div class="shortcut-item"><span>Rectangle</span> <kbd class="shortcut-kbd">R</kbd></div>
            <div class="shortcut-item"><span>Ellipse</span> <kbd class="shortcut-kbd">O</kbd></div>
            <div class="shortcut-item"><span>Undo</span> <kbd class="shortcut-kbd">Ctrl+Z</kbd></div>
            <div class="shortcut-item"><span>Redo</span> <kbd class="shortcut-kbd">Ctrl+Y</kbd></div>
            <div class="shortcut-item"><span>Open File</span> <kbd class="shortcut-kbd">Ctrl+O</kbd></div>
            <div class="shortcut-item"><span>Save</span> <kbd class="shortcut-kbd">Ctrl+S</kbd></div>
            <div class="shortcut-item"><span>Save As</span> <kbd class="shortcut-kbd">Ctrl+Shift+S</kbd></div>
          </div>
        </div>
      </div>
    `;

    this.bindShellEvents();
  }

  /**
   * Updates ONLY the folder filter tabs and recent documents grid in place
   * without touching the page shell or replaying entry animations.
   */
  private updateLibraryDOM(): void {
    const libraryBody = this._container.querySelector<HTMLElement>('#landing-library-body');
    if (!libraryBody) return;

    const allCount = this._recentDocs.length;
    const uncategorizedCount = this._recentDocs.filter(d => !d.folderId).length;

    let filteredDocs = this._recentDocs;
    if (this._activeFolderId === 'uncategorized') {
      filteredDocs = this._recentDocs.filter(d => !d.folderId);
    } else if (this._activeFolderId !== 'all') {
      filteredDocs = this._recentDocs.filter(d => d.folderId === this._activeFolderId);
    }

    const activeFolder = this._folders.find(f => f.id === this._activeFolderId);

    libraryBody.innerHTML = `
      <!-- Folder Filter Tabs Bar -->
      <div class="folder-tabs-bar">
        <button class="folder-tab-pill ${this._activeFolderId === 'all' ? 'active' : ''}" data-folder-pill="all">
          <span>All Files</span>
          <span class="folder-count">${allCount}</span>
        </button>

        <button class="folder-tab-pill ${this._activeFolderId === 'uncategorized' ? 'active' : ''}" data-folder-pill="uncategorized">
          <span>Uncategorized</span>
          <span class="folder-count">${uncategorizedCount}</span>
        </button>

        ${this._folders.map(folder => {
          const count = this._recentDocs.filter(d => d.folderId === folder.id).length;
          const isActive = this._activeFolderId === folder.id;
          return `
            <button class="folder-tab-pill ${isActive ? 'active' : ''}" data-folder-pill="${folder.id}" 
                    style="${isActive ? `border-color:${folder.color}; box-shadow:0 0 12px ${folder.color}40;` : ''}">
              <span style="color:${folder.color};">${getIconSvg(folder.icon, 13)}</span>
              <span>${folder.name}</span>
              <span class="folder-count" style="${isActive ? `background:${folder.color};` : ''}">${count}</span>
            </button>
          `;
        }).join('')}

        <button class="folder-new-btn" id="open-new-folder-modal-btn" title="Create a new folder category">
          ${getIconSvg('folderPlus', 14)}
          <span>New Folder</span>
        </button>
      </div>

      <!-- Active Folder Actions Bar -->
      ${activeFolder ? `
        <div class="folder-action-bar">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:${activeFolder.color};">${getIconSvg(activeFolder.icon, 15)}</span>
            <span>Category: <strong>${activeFolder.name}</strong> • ${filteredDocs.length} ${filteredDocs.length === 1 ? 'file' : 'files'}</span>
          </div>
          <button class="folder-danger-btn" id="delete-current-folder-btn" data-del-folder="${activeFolder.id}" title="Delete this folder">
            ${getIconSvg('trash', 13)}
            <span>Delete Folder</span>
          </button>
        </div>
      ` : ''}

      <!-- Documents Grid -->
      <div class="recent-grid">
        ${filteredDocs.length === 0 ? `
          <div class="folder-empty-state">
            No documents in this category. Open a PDF to add it here, or move an existing PDF using the category selector below.
          </div>
        ` : filteredDocs.map(doc => {
          const docFolder = this._folders.find(f => f.id === doc.folderId);
          return `
            <div class="recent-card" data-recent-id="${doc.id}">
              <div class="recent-card-icon" style="${docFolder ? `background:${docFolder.color}22; color:${docFolder.color};` : ''}">
                ${getIconSvg(docFolder ? docFolder.icon : 'fileText', 20)}
              </div>
              <div class="recent-card-info">
                <div class="recent-card-name" title="${doc.name}">${doc.name}</div>
                <div class="recent-card-meta">
                  <span>${doc.pageCount ? doc.pageCount + ' pages • ' : ''}${this.formatRelativeTime(doc.lastOpenedAt)}</span>
                  ${docFolder ? `
                    <span class="doc-folder-tag" style="background:${docFolder.color}20; color:${docFolder.color}; border:1px solid ${docFolder.color}40;">
                      ${getIconSvg(docFolder.icon, 11)}
                      <span>${docFolder.name}</span>
                    </span>
                  ` : ''}
                </div>
              </div>
              <div class="recent-card-actions">
                <select class="recent-folder-select" data-doc-assign="${doc.id}" title="Change Folder Category">
                  <option value="">Move to...</option>
                  <option value="none" ${!doc.folderId ? 'selected' : ''}>Uncategorized</option>
                  ${this._folders.map(f => `
                    <option value="${f.id}" ${doc.folderId === f.id ? 'selected' : ''}>${f.name}</option>
                  `).join('')}
                </select>
                <button class="recent-remove-btn" data-remove-recent="${doc.id}" title="Remove from list">
                  ${getIconSvg('close', 13)}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    this.bindLibraryEvents(libraryBody);
  }

  private updateFolderModalDOM(): void {
    const slot = this._container.querySelector<HTMLElement>('#landing-folder-modal-slot');
    if (!slot) return;

    if (!this._showCreateFolderModal) {
      slot.innerHTML = '';
      return;
    }

    const folderColors = [
      '#6366f1', '#10b981', '#f43f5e', '#f59e0b',
      '#8b5cf6', '#06b6d4', '#2563eb', '#dc2626'
    ];
    const folderIcons = ['folder', 'book', 'briefcase', 'star', 'tag', 'code'];

    slot.innerHTML = `
      <div class="modal-overlay" id="new-folder-modal-overlay">
        <div class="modal-dialog form-dialog" role="dialog" aria-modal="true" aria-label="Create category folder">
          <div class="panel-header">
            <span class="panel-header-title">
              ${getIconSvg('folderPlus', 16)}
              Create Category Folder
            </span>
            <button id="close-folder-modal-btn" class="icon-btn is-small" title="Close" aria-label="Close">
              ${getIconSvg('close', 14)}
            </button>
          </div>

          <div class="form-dialog-body">
            <div class="form-field">
              <label class="form-label" for="folder-name-input">Folder Name</label>
              <input type="text" id="folder-name-input" class="field"
                     placeholder="e.g. Mathematics, Contracts, Research" autofocus />
            </div>

            <div class="form-field">
              <span class="form-label">Folder Color</span>
              <div class="chip-row">
                ${folderColors.map(color => `
                  <button type="button"
                          class="color-swatch is-square ${this._selectedFolderColor === color ? 'active' : ''}"
                          data-pick-folder-color="${color}"
                          style="background-color:${color};"
                          title="${color}" aria-label="Colour ${color}"
                          aria-pressed="${this._selectedFolderColor === color}"></button>
                `).join('')}
              </div>
            </div>

            <div class="form-field">
              <span class="form-label">Folder Icon</span>
              <div class="chip-row">
                ${folderIcons.map(icon => `
                  <button type="button"
                          class="secondary-btn is-compact is-capitalized ${this._selectedFolderIcon === icon ? 'is-selected' : ''}"
                          data-pick-folder-icon="${icon}"
                          aria-pressed="${this._selectedFolderIcon === icon}">
                    ${getIconSvg(icon, 15)}
                    ${icon}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="form-actions">
              <button id="cancel-folder-btn" class="secondary-btn">Cancel</button>
              <button id="submit-folder-btn" class="primary-btn">Create Folder</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindFolderModalEvents(slot);
  }

  /**
   * The paper chooser lives in its own overlay host appended to the body, so it
   * survives the landing page re-rendering underneath it.
   */
  private openNotebookDialog(): void {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const dialog = new NotebookDialogComponent(host, {
      mode: 'create',
      onClose: () => host.remove(),
      onSubmit: async ({ paper, pageSize, pageCount }) => {
        try {
          const bytes = await buildNotebookPdf(paper, pageSize, pageCount);
          await this._callbacks.onOpenBytes('Notebook.pdf', bytes, { paper, pageSize });
        } catch (err) {
          console.error('Error generating notebook:', err);
        } finally {
          host.remove();
        }
      }
    });
    dialog.render();
  }

  private bindShellEvents(): void {
    const dropzone = this._container.querySelector('#landing-dropzone');
    const openBtn = this._container.querySelector('#landing-open-btn');
    const sampleBtn = this._container.querySelector('#landing-sample-btn');
    const notebookBtn = this._container.querySelector('#landing-notebook-btn');

    openBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._callbacks.onOpenFile();
    });

    dropzone?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('#dropzone-actions-group')) return;
      this._callbacks.onOpenFile();
    });

    sampleBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const bytes = await generateSamplePDF();
        await this._callbacks.onOpenBytes('Welcome to veditor.pdf', bytes);
      } catch (err: any) {
        console.error('Error generating sample PDF:', err);
      }
    });

    notebookBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openNotebookDialog();
    });

    dropzone?.addEventListener('dragover', (e: Event) => {
      const dragEvt = e as DragEvent;
      dragEvt.preventDefault();
      dropzone.classList.add('is-dragover');
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-dragover');
    });

    dropzone?.addEventListener('drop', async (e: Event) => {
      const dragEvt = e as DragEvent;
      dragEvt.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (dragEvt.dataTransfer?.files && dragEvt.dataTransfer.files[0]) {
        const file = dragEvt.dataTransfer.files[0];
        const bytes = new Uint8Array(await file.arrayBuffer());
        await this._callbacks.onOpenBytes(file.name, bytes);
      }
    });
  }

  private bindLibraryEvents(libraryBody: HTMLElement): void {
    // Folder Pill switching (instant synchronous DOM update)
    libraryBody.querySelectorAll('[data-folder-pill]').forEach(pill => {
      pill.addEventListener('click', () => {
        const folderId = pill.getAttribute('data-folder-pill');
        if (folderId && folderId !== this._activeFolderId) {
          this._activeFolderId = folderId;
          this.updateLibraryDOM();
        }
      });
    });

    // Open New Folder Modal
    libraryBody.querySelector('#open-new-folder-modal-btn')?.addEventListener('click', () => {
      this._showCreateFolderModal = true;
      this.updateFolderModalDOM();
    });

    // Delete Current Folder
    libraryBody.querySelector('#delete-current-folder-btn')?.addEventListener('click', async () => {
      if (this._activeFolderId !== 'all' && this._activeFolderId !== 'uncategorized') {
        if (confirm('Delete this folder category? The documents will be kept in Uncategorized.')) {
          const delId = this._activeFolderId;
          this._folders = this._folders.filter(f => f.id !== delId);
          this._recentDocs = this._recentDocs.map(d => d.folderId === delId ? { ...d, folderId: undefined } : d);
          this._activeFolderId = 'all';
          this.updateLibraryDOM();
          await deleteFolder(delId);
        }
      }
    });

    // Assign Document to Folder (optimistic instant update)
    libraryBody.querySelectorAll<HTMLSelectElement>('[data-doc-assign]').forEach(sel => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', (e) => {
        e.stopPropagation();
        const docId = sel.getAttribute('data-doc-assign');
        const val = sel.value;
        if (docId) {
          const targetFolderId = val === 'none' || !val ? null : val;
          this._recentDocs = this._recentDocs.map(d =>
            d.id === docId ? { ...d, folderId: targetFolderId || undefined } : d
          );
          this.updateLibraryDOM();
          void assignDocToFolder(docId, targetFolderId);
        }
      });
    });

    // Remove Document from Recents (optimistic instant removal with zero flash)
    libraryBody.querySelectorAll('[data-remove-recent]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const docId = btn.getAttribute('data-remove-recent');
        if (docId) {
          this._recentDocs = this._recentDocs.filter(d => d.id !== docId);
          this.updateLibraryDOM();
          void deleteRecentDocument(docId);
        }
      });
    });

    // Recent card click to open PDF
    libraryBody.querySelectorAll('[data-recent-id]').forEach(el => {
      el.addEventListener('click', async (e) => {
        if ((e.target as HTMLElement).closest('.recent-card-actions')) return;
        const id = el.getAttribute('data-recent-id');
        if (id) {
          await this._callbacks.onOpenRecent(id);
        }
      });
    });
  }

  private bindFolderModalEvents(slot: HTMLElement): void {
    const closeModal = () => {
      this._showCreateFolderModal = false;
      this.updateFolderModalDOM();
    };

    slot.querySelector('#close-folder-modal-btn')?.addEventListener('click', closeModal);
    slot.querySelector('#cancel-folder-btn')?.addEventListener('click', closeModal);
    slot.querySelector('#new-folder-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    slot.querySelectorAll('[data-pick-folder-color]').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = swatch.getAttribute('data-pick-folder-color');
        if (color) {
          this._selectedFolderColor = color;
          slot.querySelectorAll('[data-pick-folder-color]').forEach(s => {
            s.classList.toggle('active', s.getAttribute('data-pick-folder-color') === color);
          });
        }
      });
    });

    slot.querySelectorAll('[data-pick-folder-icon]').forEach(btn => {
      btn.addEventListener('click', () => {
        const icon = btn.getAttribute('data-pick-folder-icon');
        if (icon) {
          this._selectedFolderIcon = icon;
          slot.querySelectorAll('[data-pick-folder-icon]').forEach(b => {
            b.classList.toggle('is-selected', b.getAttribute('data-pick-folder-icon') === icon);
          });
        }
      });
    });

    slot.querySelector('#submit-folder-btn')?.addEventListener('click', async () => {
      const input = slot.querySelector<HTMLInputElement>('#folder-name-input');
      const name = input?.value.trim();
      if (!name) {
        input?.focus();
        return;
      }

      const newFolder: PDFFolder = {
        id: `folder-${Date.now()}`,
        name,
        color: this._selectedFolderColor,
        icon: this._selectedFolderIcon,
        createdAt: Date.now()
      };

      this._folders.push(newFolder);
      this._showCreateFolderModal = false;
      this._activeFolderId = newFolder.id;
      this.updateFolderModalDOM();
      this.updateLibraryDOM();
      await saveFolder(newFolder);
    });
  }

  private formatRelativeTime(timestamp: number): string {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }
}
