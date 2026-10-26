import json
import time

# 修正 ra.html 的映射關係與加上快取破除參數，讓瀏覽器強制抓取最新寫實圖片
timestamp = int(time.time())

with open("stories/ra.html", "r", encoding="utf-8") as f:
    content = f.read()

# 檢查故事資料
# 16 幕的真實對應如下：
# 第 1 幕 (誕生/登場): page1.png (寫實拉神)
# 第 2 幕 (白晝巡航): page2.png (寫實曼傑特之舟)
# 第 3 幕 (真理羽毛與秩序): page1.png 或符文卡 (目前可先用 page1.png?v=...)
# 第 4 幕 (市集勞動者): page2.png (寫實尼羅河勞動)
# 第 5 幕 (正午之巔): page2.png (寫實曼傑特)
# 第 6 幕 (午後神殿與長廊): page3.png (寫實暮色與神殿)
# 第 7 幕 (黃昏西方地平線): page3.png (寫實暮色準備)
# 第 8 幕 (眾神集結夜之舟): page3.png (寫實夜船集結)
# 第 9 幕 (杜埃特閘門): page4.png (寫實幽冥河地下巨洞)
# 第 10 幕 (迷宮之河與星圖): page4.png (寫實地下星圖)
# 第 11 幕 (地下花園安息祝福): page4.png (寫實地下水域)
# 第 12 幕 (第七時辰死寂): page5.png (寫實阿波菲斯暗黑逼近)
# 第 13 幕 (混沌巨蟒龐大身軀): page5.png (寫實阿波菲斯巨蛇現身)
# 第 14 幕 (神火與雷霆交鋒): page6.png (寫實拉神射出烈焰雷霆決戰巨蛇)
# 第 15 幕 (巴斯特神聖奇襲斬擊): page7.png (最新生成的寫實金甲巴斯特斬蛇)
# 第 16 幕 (第十二時辰破曉旭日): page8.png (最新生成的寫實金光破曉大朝陽)

image_mapping = [
    f"../images/page1.png?v={timestamp}", # 1 誕生
    f"../images/page2.png?v={timestamp}", # 2 尼羅河
    f"../images/page1.png?v={timestamp}", # 3 秩序
    f"../images/page2.png?v={timestamp}", # 4 市集
    f"../images/page2.png?v={timestamp}", # 5 正午曼傑特
    f"../images/page3.png?v={timestamp}", # 6 影子拉長
    f"../images/page3.png?v={timestamp}", # 7 黃昏
    f"../images/page3.png?v={timestamp}", # 8 夜之舟集結
    f"../images/page4.png?v={timestamp}", # 9 杜埃特閘門
    f"../images/page4.png?v={timestamp}", # 10 托特星圖
    f"../images/page4.png?v={timestamp}", # 11 地下花園
    f"../images/page5.png?v={timestamp}", # 12 第七時辰死寂
    f"../images/page5.png?v={timestamp}", # 13 阿波菲斯現身
    f"../images/page6.png?v={timestamp}", # 14 烈焰交鋒
    f"../images/page7.png?v={timestamp}", # 15 巴斯特斬蛇 (全新寫實)
    f"../images/page8.png?v={timestamp}", # 16 破曉朝陽 (全新寫實)
]

start_marker = "const storyData = "
end_marker = ";\n    const totalActs"

start_idx = content.find(start_marker) + len(start_marker)
end_idx = content.find(end_marker)

story_data = json.loads(content[start_idx:end_idx])

for i, act in enumerate(story_data):
    act["image"] = image_mapping[i]
    act["hasRealImage"] = True

new_content = content[:start_idx] + json.dumps(story_data, ensure_ascii=False, indent=2) + content[end_idx:]

with open("stories/ra.html", "w", encoding="utf-8") as f:
    f.write(new_content)

print(f"ra.html updated successfully with proper 16-act mappings and cache busting timestamp {timestamp}!")
