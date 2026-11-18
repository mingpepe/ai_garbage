with open("IMAGE_INVENTORY.md", "r", encoding="utf-8") as f:
    text = f.read()

new_status_note = """
> ⚠️ **目前配額狀態**：11/01 下午批次已達滾動上限（429）。  
> 預計下次解鎖時間：**2026-11-01 21:07:54 (約晚間 09:08 左右)**。  
> 🏆 **本輪戰果：成功生成 12 張高畫質插畫！**  
> 🟢 **四大神祇 100% 完工**：《太陽神拉》、《貓咪女神巴斯特》、《胡狼神阿努比斯》、《冥王歐西里斯》全數 16 幕獨立高清圖完工！  
> 🌟 **《魔法女神伊西斯 (Isis)》已推進至第 13 幕 (13/16)**！  
> 全館目前累積已實裝 **77 張** 高清電影級插畫。
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

print("IMAGE_INVENTORY.md successfully updated with Isis run status!")
