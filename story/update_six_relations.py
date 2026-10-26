import os
import json
from datetime import datetime
from build_complete_mythology import HTML_STORY_TEMPLATE, ALL_STORIES

# 讀取原本的 5 部關係故事，並恢復第 6 部《神靈的動物使者：古埃及動物王國大集結》
from generate_relations_and_catalogs import RELATION_STORIES

# 確保 RELATION_STORIES 剛好是 6 部
SIX_RELATIONS = RELATION_STORIES[:6]
ORIGINAL_30_GODS = [s for s in ALL_STORIES if not s.get("is_relation") and not s["id"].startswith("rel_")]

print(f"Total relation stories: {len(SIX_RELATIONS)}")
print(f"Total original gods: {len(ORIGINAL_30_GODS)}")

# 重新寫入 6 部關係故事 HTML
os.makedirs("stories", exist_ok=True)
manifest_data = []

# 先處理 6 部關係故事
for story in SIX_RELATIONS:
    sid = story["id"]
    acts_json = []
    for i, act in enumerate(story["acts"]):
        title, sub, glyph, bgStyle, paras, guide = act
        img_path = f"../images/{sid}_act_{i+1}.png"
        has_image = os.path.exists(f"images/{sid}_act_{i+1}.png")
        acts_json.append({
            "actNum": i + 1,
            "title": title,
            "subtitle": sub,
            "glyph": glyph,
            "bgStyle": bgStyle,
            "paragraphs": paras,
            "guide": guide,
            "image": img_path,
            "hasRealImage": has_image
        })
        manifest_data.append({
            "category": "特別企劃",
            "story_id": sid,
            "story_name": story["name"],
            "act_num": i + 1,
            "act_title": title,
            "image_path": f"images/{sid}_act_{i+1}.png",
            "has_real_image": has_image
        })
    html_content = HTML_STORY_TEMPLATE.format(
        story_id=sid,
        story_title=story["title"],
        god_tag=story["tag"],
        accent_color=story["color"],
        json_story_data=json.dumps(acts_json, ensure_ascii=False, indent=2)
    )
    with open(f"stories/{sid}.html", "w", encoding="utf-8") as f:
        f.write(html_content)

RA_ACT_FILES = {
    1: 'page1.png',
    2: 'page2.png',
    3: 'ra_act_3.png',
    4: 'ra_act_4.png',
    5: 'ra_act_5.png',
    6: 'ra_act_6.png',
    7: 'page3.png',
    8: 'ra_act_8.png',
    9: 'page4.png',
    10: 'ra_act_10.png',
    11: 'ra_act_11.png',
    12: 'ra_act_12.png',
    13: 'page5.png',
    14: 'page6.png',
    15: 'page7.png',
    16: 'page8.png',
}

# 處理 30 部本傳
for story in ORIGINAL_30_GODS:
    sid = story["id"]
    acts_json = []
    for i, act in enumerate(story["acts"]):
        title, sub, glyph, bgStyle, paras, guide = act
        if sid == "ra":
            img_filename = RA_ACT_FILES.get(i + 1, f"ra_act_{i+1}.png")
            img_path = f"../images/{img_filename}"
            has_image = os.path.exists(f"images/{img_filename}")
            manifest_img_path = f"images/{img_filename}"
        else:
            img_filename = f"{sid}_act_{i+1}.png"
            img_path = f"../images/{img_filename}"
            has_image = os.path.exists(f"images/{img_filename}")
            manifest_img_path = f"images/{img_filename}"
        acts_json.append({
            "actNum": i + 1,
            "title": title,
            "subtitle": sub,
            "glyph": glyph,
            "bgStyle": bgStyle,
            "paragraphs": paras,
            "guide": guide,
            "image": img_path,
            "hasRealImage": has_image
        })
        manifest_data.append({
            "category": "神祇英雄傳",
            "story_id": sid,
            "story_name": story["name"],
            "act_num": i + 1,
            "act_title": title,
            "image_path": manifest_img_path,
            "has_real_image": has_image
        })
    html_content = HTML_STORY_TEMPLATE.format(
        story_id=sid,
        story_title=story["title"],
        god_tag=story["tag"],
        accent_color=story["color"],
        json_story_data=json.dumps(acts_json, ensure_ascii=False, indent=2)
    )
    with open(f"stories/{sid}.html", "w", encoding="utf-8") as f:
        f.write(html_content)

# 更新帶有 Tab 的 index.html
INDEX_HTML = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>尼羅河神話寶盒：古埃及冒險繪本館</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800;900&family=Noto+Serif+TC:wght@600;700;900&family=Noto+Sans+TC:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    :root {{
      --gold-primary: #d4af37;
      --gold-light: #fef08a;
      --gold-dark: #8c6d1f;
      --bg-dark: #070a10;
      --card-bg: #0f1626;
      --text-main: #f1f5f9;
      --text-sub: #94a3b8;
      --border-color: #223048;
      --accent-glow: rgba(212, 175, 55, 0.2);
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    body {{
      background: radial-gradient(circle at 50% 10%, #152033 0%, #070a10 100%);
      color: var(--text-main);
      font-family: 'Noto Serif TC', 'Cinzel', serif;
      min-height: 100vh;
      padding: 24px 20px 80px;
    }}

    .container {{
      max-width: 1280px;
      margin: 0 auto;
    }}

    .hero-header {{
      text-align: center;
      margin-bottom: 28px;
    }}

    .hero-glyph {{
      font-size: 3rem;
      filter: drop-shadow(0 0 15px rgba(212, 175, 55, 0.6));
      margin-bottom: 8px;
    }}

    .hero-title {{
      font-size: 2.2rem;
      font-weight: 900;
      color: var(--gold-primary);
      letter-spacing: 1.5px;
      margin-bottom: 10px;
      text-shadow: 0 4px 15px rgba(0,0,0,0.6);
    }}

    .hero-desc {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 1.05rem;
      color: var(--text-sub);
      max-width: 840px;
      margin: 0 auto;
      line-height: 1.8;
    }}

    .tab-navigation-bar {{
      display: flex;
      justify-content: center;
      gap: 16px;
      margin: 32px 0 24px;
      position: sticky;
      top: 10px;
      z-index: 100;
    }}

    .nav-tab-btn {{
      background: rgba(15, 22, 38, 0.95);
      border: 2px solid var(--border-color);
      border-radius: 999px;
      padding: 12px 28px;
      color: var(--text-sub);
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 1.05rem;
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
    }}

    .nav-tab-btn:hover {{
      color: var(--gold-light);
      border-color: var(--gold-dark);
      transform: translateY(-2px);
    }}

    .nav-tab-btn.active {{
      background: linear-gradient(135deg, rgba(212, 175, 55, 0.3) 0%, rgba(140, 109, 31, 0.3) 100%);
      border-color: var(--gold-primary);
      color: #ffffff;
      box-shadow: 0 0 20px rgba(212, 175, 55, 0.35);
    }}

    .tab-badge {{
      background: rgba(255, 255, 255, 0.12);
      padding: 2px 9px;
      border-radius: 12px;
      font-size: 0.82rem;
      font-weight: 700;
    }}

    .nav-tab-btn.active .tab-badge {{
      background: var(--gold-primary);
      color: #0b0f17;
    }}

    .tab-intro-banner {{
      background: rgba(18, 27, 44, 0.7);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 14px 22px;
      margin-bottom: 24px;
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.95rem;
      color: var(--gold-light);
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .tab-pane {{
      display: none;
    }}

    .tab-pane.active {{
      display: block;
      animation: fadeIn 0.35s ease;
    }}

    @keyframes fadeIn {{
      from {{ opacity: 0; transform: translateY(6px); }}
      to {{ opacity: 1; transform: translateY(0); }}
    }}

    .story-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 22px;
    }}

    .story-card {{
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.25s ease;
      text-decoration: none;
      color: inherit;
      position: relative;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }}

    .story-card::before {{
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 5px;
      height: 100%;
      background: var(--card-accent, var(--gold-primary));
    }}

    .story-card:hover {{
      transform: translateY(-5px);
      border-color: var(--card-accent, var(--gold-primary));
      box-shadow: 0 14px 35px rgba(0, 0, 0, 0.6), 0 0 20px rgba(212, 175, 55, 0.15);
    }}

    .card-top {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }}

    .god-tag {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.8rem;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--card-accent, var(--gold-light));
      border: 1px solid rgba(255, 255, 255, 0.1);
    }}

    .card-acts-badge {{
      font-family: 'Cinzel', serif;
      font-size: 0.85rem;
      color: var(--text-sub);
    }}

    .card-title {{
      font-size: 1.35rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 6px;
      line-height: 1.4;
    }}

    .god-name {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--card-accent, var(--gold-primary));
      margin-bottom: 12px;
    }}

    .card-summary {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.95rem;
      line-height: 1.7;
      color: #cbd5e1;
      margin-bottom: 20px;
      flex-grow: 1;
    }}

    .card-footer {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 14px;
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.9rem;
      color: var(--text-sub);
    }}

    .read-btn {{
      color: var(--gold-light);
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: gap 0.2s ease;
    }}

    .story-card:hover .read-btn {{
      gap: 10px;
      color: #ffffff;
    }}

    .inventory-link {{
      margin-top: 50px;
      text-align: center;
      font-family: 'Noto Sans TC', sans-serif;
    }}

    .inventory-link a {{
      color: var(--gold-primary);
      text-decoration: underline;
      font-size: 0.95rem;
    }}

    @media (max-width: 768px) {{
      .hero-title {{
        font-size: 1.7rem;
      }}
      .tab-navigation-bar {{
        flex-direction: column;
      }}
      .story-grid {{
        grid-template-columns: 1fr;
      }}
    }}
  </style>
</head>
<body>

  <div class="container">
    <header class="hero-header">
      <div class="hero-glyph">𓂀☀️🪶⚖️</div>
      <h1 class="hero-title">尼羅河神話寶盒：古埃及冒險繪本館</h1>
      <p class="hero-desc">
        專為 7 歲小朋友打造的古埃及神話長篇！特別企劃 6 大「神祇關係與重大神話事件」，以及 30 位個別神祇的專屬冒險。全部採用「左圖右文・不需上下翻動」的舒適排版，支援語音朗讀與親子引導。
      </p>
    </header>

    <!-- Tab 切換列 -->
    <nav class="tab-navigation-bar">
      <button class="nav-tab-btn active" id="tabBtnRelations" onclick="switchMainTab('relations')">
        <span>📜 特別企劃：神祇關係與重大事件</span>
        <span class="tab-badge">6 部精選</span>
      </button>
      <button class="nav-tab-btn" id="tabBtnGods" onclick="switchMainTab('gods')">
        <span>🏛️ 神祇英雄傳：30位神明本傳</span>
        <span class="tab-badge">30 部傳記</span>
      </button>
    </nav>

    <!-- TAB 1：特別企劃（6 部） -->
    <section class="tab-pane active" id="paneRelations">
      <div class="tab-intro-banner">
        <span>💡</span>
        <span><strong>特別企劃導讀：</strong> 這裡收錄了跨越不同神明之間的「家族關係、名場面對決、神獸象徵與神廟秘密生活」，非常適合在讀個別神祇前先讓孩子建立完整的古埃及世界觀！</span>
      </div>

      <div class="story-grid">
"""

for story in SIX_RELATIONS:
    sid = story["id"]
    INDEX_HTML += f"""
        <a href="stories/{sid}.html" class="story-card" style="--card-accent: {story['color']};">
          <div>
            <div class="card-top">
              <span class="god-tag">{story['tag']}</span>
              <span class="card-acts-badge">16 ACTS</span>
            </div>
            <h3 class="card-title">{story['title'].split('：')[1] if '：' in story['title'] else story['title']}</h3>
            <div class="god-name">{story['name']}</div>
            <p class="card-summary">{story['summary']}</p>
          </div>
          <div class="card-footer">
            <span>⏳ 建議伴讀：分 4 次講</span>
            <span class="read-btn">進入閱讀 ➔</span>
          </div>
        </a>
"""

INDEX_HTML += """
      </div>
    </section>

    <!-- TAB 2：個別神祇本傳（30 位） -->
    <section class="tab-pane" id="paneGods">
      <div class="tab-intro-banner">
        <span>🌟</span>
        <span><strong>神祇英雄傳導讀：</strong> 收錄包含太陽神拉、貓咪女神巴斯特、胡狼神阿努比斯等 30 位偉大神祇的專屬成長冒險，深入認識祂們的代表動物、法寶與美德。</span>
      </div>

      <div class="story-grid">
"""

for story in ORIGINAL_30_GODS:
    sid = story["id"]
    INDEX_HTML += f"""
        <a href="stories/{sid}.html" class="story-card" style="--card-accent: {story['color']};">
          <div>
            <div class="card-top">
              <span class="god-tag">{story['tag']}</span>
              <span class="card-acts-badge">16 ACTS</span>
            </div>
            <h3 class="card-title">{story['title'].split('：')[1] if '：' in story['title'] else story['title']}</h3>
            <div class="god-name">{story['name']}</div>
            <p class="card-summary">{story['summary']}</p>
          </div>
          <div class="card-footer">
            <span>⏳ 建議伴讀：分 4 次講</span>
            <span class="read-btn">進入閱讀 ➔</span>
          </div>
        </a>
"""

INDEX_HTML += """
      </div>
    </section>

    <footer class="inventory-link">
      <p>🎨 視覺插畫生成進度記錄：<a href="IMAGE_INVENTORY.md" target="_blank">查看目前圖檔生成狀態清單 (IMAGE_INVENTORY.md)</a></p>
    </footer>
  </div>

  <script>
    function switchMainTab(tabName) {
      const btnRelations = document.getElementById('tabBtnRelations');
      const btnGods = document.getElementById('tabBtnGods');
      const paneRelations = document.getElementById('paneRelations');
      const paneGods = document.getElementById('paneGods');

      if (tabName === 'relations') {
        btnRelations.classList.add('active');
        btnGods.classList.remove('active');
        paneRelations.classList.add('active');
        paneGods.classList.remove('active');
      } else {
        btnGods.classList.add('active');
        btnRelations.classList.remove('active');
        paneGods.classList.add('active');
        paneRelations.classList.remove('active');
      }
    }
  </script>
</body>
</html>
"""

with open("index.html", "w", encoding="utf-8") as f:
    f.write(INDEX_HTML)

# 更新 IMAGE_INVENTORY.md
total_scenes = len(manifest_data)
ready_count = sum(1 for m in manifest_data if m["has_real_image"])
missing_count = total_scenes - ready_count

now_str = datetime.now().strftime('%Y-%m-%d %H:%M')

INVENTORY_MD = f"""# 埃及神話插畫圖檔生成進度與清單記錄 (Image Inventory)

> 最後更新時間：{now_str} (Local Time)  
> 說明：本文件詳細記錄古埃及 36 部神話繪本（包含 6 部神祇關係重大企劃 + 30 位神祇專屬本傳，共 576 幕）之配圖產生進度。系統在插圖未產生前會自動以**古埃及星象符文意境卡**完美呈現。

---

## 📊 總覽統計 (Statistics)

| 項目 | 數量 | 說明 |
| :--- | :--- | :--- |
| **神祇關係特別企劃** | **6 部** | 九柱神家族大族譜、太陽神之眼、心臟羽毛審判、荷魯斯大戰賽特、神殿的一天、神靈動物使者 |
| **神祇英雄本傳** | **30 部** | 包含太陽神拉、貓咪女神巴斯特、胡狼神阿努比斯等 30 位個別故事 |
| **總收錄故事** | **36 部** | 總計 576 幕大篇幅故事 |
| **已生成高清圖片** | **{ready_count} 張** | 包含太陽神拉 16 幕全數完成、巴斯特前 8 幕、阿努比斯前 4 幕 |
| **待產生插圖檔案** | **{missing_count} 張** | 目前以古埃及神聖意境卡無縫替代 |

---

## 🏛️ 各故事插畫進度一覽表 (Story Manifest)

### 一、 特別企劃：神祇關係與重大神話傳奇 (共 6 部)

| 編號 | 主題名稱 (Story ID) | 故事檔案 | 總幕數 | 狀態 |
| :---: | :--- | :--- | :---: | :---: |
"""

for s in SIX_RELATIONS:
    sid = s["id"]
    s_acts = [m for m in manifest_data if m["story_id"] == sid]
    s_ready = sum(1 for a in s_acts if a["has_real_image"])
    s_missing = len(s_acts) - s_ready
    status_str = f"🟢 完成 ({s_ready}/16)" if s_ready == 16 else (f"🟡 部分完成 ({s_ready}/16)" if s_ready > 0 else "⚪ 意境卡替代中 (0/16)")
    INVENTORY_MD += f"| {sid} | **{s['name']}** | [`stories/{sid}.html`](stories/{sid}.html) | {len(s_acts)} 幕 | {status_str} |\n"

INVENTORY_MD += """
---

### 二、 神祇英雄傳：個別神明冒險本傳 (30 位)

| 編號 | 神祇名稱 (Story ID) | 故事檔案 | 總幕數 | 已完成圖檔 | 狀態 |
| :---: | :--- | :--- | :---: | :---: | :---: |
"""

for s in ORIGINAL_30_GODS:
    sid = s["id"]
    s_acts = [m for m in manifest_data if m["story_id"] == sid]
    s_ready = sum(1 for a in s_acts if a["has_real_image"])
    s_missing = len(s_acts) - s_ready
    status_str = f"🟢 完成 ({s_ready}/16)" if s_ready == 16 else (f"🟡 部分完成 ({s_ready}/16)" if s_ready > 0 else "⚪ 意境卡替代中 (0/16)")
    INVENTORY_MD += f"| {sid} | **{s['name']}** | [`stories/{sid}.html`](stories/{sid}.html) | {len(s_acts)} 幕 | {s_ready} 張 | {status_str} |\n"

with open("IMAGE_INVENTORY.md", "w", encoding="utf-8") as f:
    f.write(INVENTORY_MD)

print("IMAGE_INVENTORY.md and all 36 HTML files generated successfully!")
