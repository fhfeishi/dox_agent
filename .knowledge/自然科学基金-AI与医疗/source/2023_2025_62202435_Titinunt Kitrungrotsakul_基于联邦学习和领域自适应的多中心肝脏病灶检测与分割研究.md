---
id: 65525bebc72dd05c11d50bdc1dab86ea
projectName: 基于联邦学习和领域自适应的多中心肝脏病灶检测与分割研究
ratifyNo: 62202435
projectType: 630
code: F0213
projectAdmin: Titinunt Kitrungrotsakul
projectAdminID: 1acbf9dd50d28a23a073879dcad427eb
adminPosition:
dependUnit: 之江实验室
dependUintID: 89f15c78bb1adec726e3495a24ba5564
researchTimeScope: 2023-01-01 00:00:00.0到2025-12-31 00:00:00.0
startYear: 2023
endYear: 2025
supportNum: 30.0
hasReport: true
achievementCount: 4
---

# 基于联邦学习和领域自适应的多中心肝脏病灶检测与分割研究

## 项目信息

| 字段 | 内容 |
| --- | --- |
| 批准号 | 62202435 |
| 项目类型 | 630 |
| 申请代码 | F0213 |
| 负责人 | Titinunt Kitrungrotsakul |
| 依托单位 | 之江实验室 |
| 研究期限 | 2023-01-01 00:00:00.0到2025-12-31 00:00:00.0 |
| 资助金额 | 30.0 |

## 中文摘要

随着医疗领域技术的快速发展，医疗数据正以数字形式提供。这些数据成为数据科学家推动数据驱动提高医疗质量的机会。目前，基于人工智能的诊断工具已在多个医疗领域显示出良好效果。医学图像的检测与分割是医学图像计算机辅助诊断系统的基础。然而，公共数据的可用性阻碍了医学图像应用程序的性能，因为训练模型需要的大规模CT图像和标注数据的获得是非常耗时和需要专业的经验的。因此，多中心训练方案优于单中心训练方案，因为多中心训练方案可以扩展已有案例的范围，增加数据共享，增加训练数据量，保障训练模型更加稳健。通过中心之间的协作和数据共享来解决人工智能模型训练公共数据的不足问题。但由于医疗数据隐私法规和数据异质性，人工智能训练和评估数据集的可用性受到阻碍。病人的机密和敏感信息往往无法在机构外传播。针对以上问题，在这本项目中，以多期CT图像为例，提出了基于联邦学习的多中心肝脏和肝脏病变检测与分割的病变诊断方案。

## 英文摘要

With the rapid improvement of technologies in healthcare field, healthcare data such as patient information, medical imaging, diagnosis decision and etc. are becoming available  in digital form. Those data become an opportunity for data scientists to drive data-driven intuitions and improve the quality of healthcare. Currently, diagnostic tools based on artificial intelligence (AI) have shown promising results in multiple medical domains. Detection and segmentation of medical imaging are fundamental of medical image computer-aid diagnostic system. The results of those works can be used to assist doctors in their diagnosis processes. Unfortunately, the availability of public data hinders the performance of medical image application due to the robust medical image application require large-scale datasets. CT image and ground truth data are required during the training model. Obtaining an accurate ground truth is time consuming and experience from expertise. Because of those reasons, multi-centre training schemes are superior to single-centre training schemes because they can extent the scope of the existing cases, more data sharing, increasing the training data, and the training model become more robust. With the existing of multi-centre training schemes, the lack of public data for training the AI model can be solved by collaborate and sharing the data between centers. However, the availability of datasets for AI training and evaluation is obstructed because of the medical data privacy regulations and data heterogeneity. Confidential and sensitive information about patients that often cannot be distributed outside the institutions, especially when de-identification cannot be guaranteed. In this proposal, I propose a multi-centre liver and liver’s lesion detection and segmentation for lesion diagnostic using federated learning in multi-phase CT image.

## 中文关键词

可视化;目标检测;联邦学习;图像分割

## 英文关键词

可视化;目标检测;联邦学习;图像分割

## 结题摘要

本项目聚焦多中心医疗影像智能分析在真实落地中面临的核心困难：数据隐私限制导致难以集中共享训练，医院之间存在显著域偏移（设备、协议、人群差异），标注资源分布不均，同时多期CT蕴含丰富增强信息但融合建模复杂。围绕肝脏病灶检测与分割任务，项目提出并验证了一套“隐私保护协同学习—跨域鲁棒泛化—可部署模型生成”的模块化技术路线。在联邦学习层面，构建域感知联邦学习框架DAFed，通过潜空间分布对齐与域相似性驱动的聚合/个性化机制，提升非IID多中心条件下的泛化稳定性，并为新加入中心或弱标注场景提供可用模型生成路径；在下游任务层面，提出多尺度相位注意力模型MSPA-DLA++，面向多期CT显式刻画相位增强模式与尺度变化，提高对小病灶与复杂增强表现的检测敏感性；在部署层面，形成KDRL与HIMS_KD两条鲁棒知识迁移与高效压缩方案，用于将高性能教师模型转化为轻量学生模型，并在医疗影像任务上完成验证（详见补充材料）。项目在多中心与临床数据上开展系统实验，包括5家医院共548例患者的多中心COVID-19 CT设置、121例多期腹部CT肝肿瘤分割数据以及LiTS2017等公开基准，采用Dice、AP等指标评估。研究结果表明：面向域偏移的联邦学习与结构化多期建模能够显著提升跨中心鲁棒性与临床任务性能，为多中心隐私保护协同建模与后续临床部署提供了可扩展的技术基础。

## 成果列表（4）

1. [期刊论文] Knowledge Distillation Meets Reinforcement Learning: A Cluster-Driven Approach to Image Processing — Titinunt Kitrungrotsakul;Yingying Xu;Preeyanuch Srichola
2. [会议论文] MSPA-DLA++: A Multi-Scale Phase Attention Deep Layer Aggregation for Lesion Detection in Multi-Phase CT Images — Titinunt Kitrungrotsakul;Yingying Xu;Qingqing Chen;Jing Liu;Yinhao Li;Lanfen Lin;Hongjie Hu;Ruofeng Tong;Jingsong Li;Yen-Wei Chen
3. [专利] 模型训练方法、装置、电子设备和存储介质 — Titinunt Kitrungrotsakul;许莹莹;姚柯璐;李超
4. [期刊论文] Hierarchical Knowledge Distillation for Efficient Model Compression and Transfer: A Multi-Level Aggregation Approach — Titinunt Kitrungrotsakul;Preeyanuch Srichola
