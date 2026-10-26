import os

with open("IMAGE_INVENTORY.md", "r", encoding="utf-8") as f:
    text = f.read()

new_status_note = """
> ⚠️ **目前配額狀態**：晚間第三輪批次已達滾動上限（429）。  
> 預計下次解鎖時間：**2026-10-26 00:11:29 (約午夜 12:11 左右)**。  
> 本輪戰果：成功完成 13 張高清插畫！《太陽神之書 (Ra)》16 幕 100% 完工，《貓咪女神巴斯特 (Bastet)》16 幕 100% 完工，《胡狼神阿努比斯 (Anubis)》已推進至第 11 幕！  
> 午夜解鎖後將從《阿努比斯第 12 幕》接續，補滿阿努比斯全篇 16 幕並開啟歐西里斯篇章。
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

print("IMAGE_INVENTORY.md successfully updated with midnight quota status!")
