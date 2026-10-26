import os

with open("IMAGE_INVENTORY.md", "r", encoding="utf-8") as f:
    text = f.read()

# 補充說明目前配額冷卻狀態
status_note = """
> ⚠️ **目前配額狀態**：今日第二輪批次已達滾動上限（429）。  
> 預計下次解鎖時間：**2026-10-25 14:11:29 (約下午 02:11 左右)**。  
> 待解鎖後將優先為《太陽神之書》補齊剩餘 8 張完全獨立不重複的高清插畫（第 3、4、5、6、8、10、11、12 幕）。
"""

if "⚠️ **目前配額狀態**" not in text:
    text = text.replace("---", status_note + "\n---", 1)
    with open("IMAGE_INVENTORY.md", "w", encoding="utf-8") as f:
        f.write(text)
    print("IMAGE_INVENTORY.md updated with quota reset time.")
else:
    print("Already updated.")
