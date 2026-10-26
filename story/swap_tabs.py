with open("index.html", "r", encoding="utf-8") as f:
    html = f.read()

# 定義要替換的 tab navigation bar
old_nav = """    <!-- Tab 切換列 -->
    <nav class="tab-navigation-bar">
      <button class="nav-tab-btn active" id="tabBtnRelations" onclick="switchMainTab('relations')">
        <span>📜 特別企劃：神祇關係與重大事件</span>
        <span class="tab-badge">6 部精選</span>
      </button>
      <button class="nav-tab-btn" id="tabBtnGods" onclick="switchMainTab('gods')">
        <span>🏛️ 神祇英雄傳：30位神明本傳</span>
        <span class="tab-badge">30 部傳記</span>
      </button>
    </nav>"""

new_nav = """    <!-- Tab 切換列（左右交換：神祇英雄傳在左、特別企劃在右） -->
    <nav class="tab-navigation-bar">
      <button class="nav-tab-btn active" id="tabBtnGods" onclick="switchMainTab('gods')">
        <span>🏛️ 神祇英雄傳：30位神明本傳</span>
        <span class="tab-badge">30 部傳記</span>
      </button>
      <button class="nav-tab-btn" id="tabBtnRelations" onclick="switchMainTab('relations')">
        <span>📜 特別企劃：神祇關係與重大事件</span>
        <span class="tab-badge">6 部精選</span>
      </button>
    </nav>"""

# 把 paneGods 設為預設 active，paneRelations 設為非 active
html = html.replace(old_nav, new_nav)
html = html.replace('<section class="tab-pane active" id="paneRelations">', '<section class="tab-pane" id="paneRelations">')
html = html.replace('<section class="tab-pane" id="paneGods">', '<section class="tab-pane active" id="paneGods">')

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html)

print("Swapped tab positions and set Gods tab as default active tab successfully!")
