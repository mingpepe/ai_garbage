#!/bin/bash
echo "=== 正在檢查並同步 manual_downloads 中的圖片至繪本專案 ==="
TARGET_DIR="/home/kk/ai_garbage/story/images"
SOURCE_DIR="/home/kk/ai_garbage/story/manual_downloads/images"

count=$(ls -1 "$SOURCE_DIR"/*.png 2>/dev/null | wc -l)

if [ "$count" -eq 0 ]; then
  echo "⚠️ 提示：在 $SOURCE_DIR 中尚未發現任何 .png 檔案。"
  echo "請先將下載好的圖片存入該目錄，再執行本腳本！"
  exit 1
fi

echo "發現 $count 張新圖片，正在複製至 $TARGET_DIR ..."
cp -v "$SOURCE_DIR"/*.png "$TARGET_DIR"/

echo "正在更新繪本 HTML 與 IMAGE_INVENTORY.md ..."
python3 /home/kk/ai_garbage/story/apply_new_images.py

echo "🎉 同步完成！您可以在瀏覽器開啟 http://localhost:8080/stories/osiris.html 立即查看成果！"
