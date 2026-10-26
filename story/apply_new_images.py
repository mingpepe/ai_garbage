import os
import json
import time

def sync_all():
    # 執行 update_six_relations.py 更新其他故事與 inventory
    if os.path.exists("update_six_relations.py"):
        os.system("python3 update_six_relations.py")

    timestamp = int(time.time())
    
    # 檢查太陽神 16 幕獨立圖片
    # 規則：如果 ra_act_X.png 存在，則使用；否則使用默認 mapping
    ra_default_map = [
        "page1.png", "page2.png", "page1.png", "page2.png", 
        "page2.png", "page3.png", "page3.png", "page3.png",
        "page4.png", "page4.png", "page4.png", "page5.png",
        "page5.png", "page6.png", "page7.png", "page8.png"
    ]
    
    if os.path.exists("stories/ra.html"):
        with open("stories/ra.html", "r", encoding="utf-8") as f:
            content = f.read()
        start_marker = "const storyData = "
        end_marker = ";\n    const totalActs"
        start_idx = content.find(start_marker) + len(start_marker)
        end_idx = content.find(end_marker)
        if start_idx != -1 and end_idx != -1:
            story_data = json.loads(content[start_idx:end_idx])
            for i, act in enumerate(story_data):
                act_num = i + 1
                unique_file = f"ra_act_{act_num}.png"
                if os.path.exists(f"images/{unique_file}"):
                    act["image"] = f"../images/{unique_file}?v={timestamp}"
                    act["hasRealImage"] = True
                else:
                    base = ra_default_map[i]
                    act["image"] = f"../images/{base}?v={timestamp}"
                    act["hasRealImage"] = True
            new_content = content[:start_idx] + json.dumps(story_data, ensure_ascii=False, indent=2) + content[end_idx:]
            with open("stories/ra.html", "w", encoding="utf-8") as f:
                f.write(new_content)


if __name__ == "__main__":
    sync_all()
    print("All story HTML files and inventory synchronized!")
