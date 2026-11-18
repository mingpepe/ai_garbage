with open("IMAGE_INVENTORY.md", "r", encoding="utf-8") as f:
    text = f.read()

new_status_note = """
> ⚠️ **目前配額狀態**：已成功產出並上線 `osiris_act_6.png`。  
> 隨後在生成第 7 幕時觸發週配額限制（429）。  
> 預計下次解鎖時間：**2026-10-31 23:07:53 (UTC+8，約 26 小時後)**。  
> 本週累計高畫質插畫已達 **54 張**！
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

print("IMAGE_INVENTORY.md updated.")
