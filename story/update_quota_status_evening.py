import os

with open("IMAGE_INVENTORY.md", "r", encoding="utf-8") as f:
    text = f.read()

new_status_note = """
> ⚠️ **目前配額狀態**：下午第二輪批次已達滾動上限（429）。  
> 預計下次解鎖時間：**2026-10-25 19:11:29 (約晚間 07:11 左右)**。  
> 本輪戰果：成功完成 12 張高清插畫！《太陽神之書》已全數 16 幕完工（100% 獨立無重複），《貓咪女神巴斯特》已完成至第 10 幕。  
> 晚間解鎖後將繼續從《巴斯特第 11 幕（夢魘漩渦）》接續產圖。
"""

# 替換前一次的狀態備註
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

print("IMAGE_INVENTORY.md successfully updated with latest evening quota status!")
