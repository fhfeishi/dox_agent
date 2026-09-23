"""
NSFC结题报告下载工具
从 kd.nsfc.cn 下载结题报告全文图片并合成PDF

用法:
    python nsfc_report_download.py <URL或项目ID> [输出目录]

示例:
    python nsfc_report_download.py https://kd.nsfc.cn/finalDetails?id=f61c67b8a6908051a73399e4975e071c
    python nsfc_report_download.py f61c67b8a6908051a73399e4975e071c
    python nsfc_report_download.py f61c67b8a6908051a73399e4975e071c ./.output
"""

import sys
import os
import glob
import time
import re
from urllib.parse import urlparse, parse_qs

import requests
from PIL import Image

HOST = "https://kd.nsfc.cn"
HEADERS = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}
MAX_RETRIES = 5
DELAY_BETWEEN_PAGES = 1
RETRY_DELAY = 3


def extract_project_id(url_or_id: str) -> str:
    """从URL或直接的ID字符串中提取项目ID"""
    if url_or_id.startswith("http"):
        parsed = urlparse(url_or_id)
        params = parse_qs(parsed.query)
        if "id" in params:
            return params["id"][0]
        raise ValueError(f"URL中未找到id参数: {url_or_id}")
    # 直接传入ID（32位十六进制）
    cleaned = url_or_id.strip()
    if re.match(r'^[a-f0-9]{32}$', cleaned):
        return cleaned
    raise ValueError(f"无效的项目ID: {cleaned}")


def get_project_info(project_id: str) -> dict:
    """获取项目基本信息"""
    url = f"{HOST}/api/baseQuery/conclusionProjectInfo/{project_id}"
    resp = requests.post(url, headers=HEADERS, timeout=30)
    data = resp.json()
    if data.get("code") != 200:
        raise RuntimeError(f"获取项目信息失败: {data}")
    info = data["data"]
    return {
        "name": info.get("projectName", "未知项目"),
        "admin": info.get("projectAdmin", ""),
        "unit": info.get("dependUnit", ""),
        "ratify_no": info.get("ratifyNo", ""),
    }


def download_page(project_id: str, index: int) -> tuple[bytes | None, str]:
    """下载单页图片，返回 (图片数据, 扩展名) 或 (None, '') 表示已无更多页"""
    api_url = f"{HOST}/api/baseQuery/completeProjectReport"
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(
                api_url, headers=HEADERS,
                data=f"id={project_id}&index={index}", timeout=30,
            )
            data = resp.json()
        except Exception as e:
            print(f"  [重试 {attempt+1}/{MAX_RETRIES}] API请求失败: {e}")
            time.sleep(RETRY_DELAY)
            continue

        if data.get("code") != 200 or not data.get("data", {}).get("url"):
            return None, ""

        img_url = HOST + data["data"]["url"]
        try:
            img_resp = requests.get(
                img_url,
                headers={"user-agent": HEADERS["user-agent"]},
                timeout=30,
            )
        except Exception as e:
            print(f"  [重试 {attempt+1}/{MAX_RETRIES}] 下载失败: {e}")
            time.sleep(RETRY_DELAY)
            continue

        if img_resp.status_code == 404:
            return None, ""
        if img_resp.status_code != 200:
            print(f"  [重试 {attempt+1}/{MAX_RETRIES}] HTTP {img_resp.status_code}")
            time.sleep(RETRY_DELAY)
            continue

        # 检测图片格式
        header_bytes = img_resp.content[:4]
        if header_bytes[:4] == b'\x89PNG':
            ext = ".png"
        elif header_bytes[:3] == b'\xff\xd8\xff':
            ext = ".jpg"
        else:
            ext = ".png"
        return img_resp.content, ext

    raise RuntimeError(f"第 {index} 页下载失败，已重试 {MAX_RETRIES} 次")


def download_images(project_id: str, output_dir: str) -> int:
    """逐页下载报告图片，返回总页数"""
    os.makedirs(output_dir, exist_ok=True)
    index = 1
    while True:
        print(f"正在下载第 {index} 页...", end=" ", flush=True)
        content, ext = download_page(project_id, index)
        if content is None:
            print("无更多页面")
            break

        filename = f"page_{index:03d}{ext}"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "wb") as f:
            f.write(content)
        print(f"{filename} ({len(content)/1024:.1f} KB)")

        index += 1
        time.sleep(DELAY_BETWEEN_PAGES)

    return index - 1


def images_to_pdf(image_dir: str, output_pdf: str) -> None:
    """将目录中的图片按顺序合成PDF"""
    patterns = [os.path.join(image_dir, f"page_*.{ext}") for ext in ("png", "jpg")]
    image_files = sorted(f for p in patterns for f in glob.glob(p))

    if not image_files:
        raise FileNotFoundError(f"目录中未找到图片: {image_dir}")

    print(f"\n正在合成PDF（{len(image_files)}页）...")
    images = [Image.open(f).convert("RGB") for f in image_files]

    images[0].save(
        output_pdf, "PDF",
        resolution=150.0, save_all=True, append_images=images[1:],
    )
    size_mb = os.path.getsize(output_pdf) / (1024 * 1024)
    print(f"PDF已生成: {output_pdf} ({size_mb:.1f} MB)")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    project_id = extract_project_id(sys.argv[1])
    base_dir = sys.argv[2] if len(sys.argv) > 2 else "."

    print(f"项目ID: {project_id}")
    info = get_project_info(project_id)
    print(f"项目名称: {info['name']}")
    print(f"负责人: {info['admin']}  依托单位: {info['unit']}")
    print(f"批准号: {info['ratify_no']}")
    print()

    # 用批准号和项目名创建目录和文件名
    safe_name = re.sub(r'[/\\?%*:|"<>]', '-', info['name'])
    image_dir = os.path.join(base_dir, f"结题报告_{info['ratify_no']}")
    pdf_path = os.path.join(base_dir, f"结题报告_{info['ratify_no']}_{safe_name}.pdf")

    total = download_images(project_id, image_dir)
    print(f"\n下载完成，共 {total} 页，图片保存在: {image_dir}")

    images_to_pdf(image_dir, pdf_path)


if __name__ == "__main__":
    main()