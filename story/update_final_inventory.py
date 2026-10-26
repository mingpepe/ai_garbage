import os

with open("IMAGE_INVENTORY.md", "r", encoding="utf-8") as f:
    text = f.read()

new_status_note = """
> ⚠️ **目前配額狀態**：午夜批次生成已達上限（429）。  
> 本輪戰果：成功完成 10 張全新高清插畫！  
> 🟢 **三大神祇 100% 完工**：《太陽神拉 (Ra)》16 幕、《貓咪女神巴斯特 (Bastet)》16 幕、《胡狼神阿努比斯 (Anubis)》16 幕全數具備獨立高清插圖！  
> 🟡 **第四部啟動**：《冥王歐西里斯 (Osiris)》已完成前 5 幕高清插畫！  
> 全館目前累積已實裝 **53 張** 高清電影級插畫。
"""

lines = text.split("\n")
filtered_lines = []
skip = False
for line in lines:
    if "⚠️ **目前配額狀態**" in line:
        skip = True
        continue
    if skip and line.startswith("---"):
        skip = False
    if not skip:
        filtered_lines.append(line)

clean_text = "\n".join(filtered_lines)
clean_text = clean_text.replace("---", new_status_note + "\n---", 1)

with open("IMAGE_INVENTORY.md", "w", encoding="utf-8") as f:
    f.write(clean_text)

print("IMAGE_INVENTORY.md finalized!")
