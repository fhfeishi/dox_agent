![](images/page_0_image_0.jpg)

项目批准号 62172313申请代码 F0204归口管理部门收件日期

![](images/page_0_image_2.jpg)

20250162172313

# 国家自然科学基金

# 资助项目结题/成果报告

资助类别:面上项目

亚类说明:

附注说明:

项目名称:边缘智能隐私问题研究

负责人:王克浩

BRID: 08571.00.28357

电子邮件:kehao.wang@whut.edu.cn

电话: 13971396356

依托单位: 武汉理工大学

联系人: 黄忠亮

电话: 02787214969

直接费用:59.0000（万元）

执行年限: 2022.01-2025.12

填表日期:2025年12月17日

国家自然科学基金委员会制（2025年）

## 项目摘要

## 中文摘要:

目前集成边缘计算和人工智能优势的边缘智能技术引起了广泛关注，其通过合理分割机器模型在移动设备和边缘服务器上协作计算，能很好满足用户对时延和推理精度的要求。然而，物联网中不断部署的边缘节点，极易窥探和泄露隐私信息，并且边缘智能涉及到大量边缘节点、边缘服务器和云服务器的动态协作训练推理，这种多方多阶段的交互过程也极易泄露隐私，从而对边缘智能的隐私问题提出了全新的挑战。因此，本项目从边缘智能的数据收集、模型训练、预测推理及部署四个阶段研究其隐私保护问题，重点研究多方差分隐私的中间方连接方式、异步公平学习隐私、多等级智能机器模型的成员和属性攻击中的差分集合隐私问题，引入差分隐私、密码学、多方安全计算及其混合机制实现隐私保护，然后探索集成区块链技术的边缘智能服务部署隐私保护。本项目的研究成果能对物联网环境下人工智能服务的隐私保护提供重要的理论指导和技术支撑。

## Abstract:

Nowadays, the edge intelligence technology, which combines the advantages of edge computing and artificial intelligence, has attracted widespread attention from academic and industrial fields. Specifically, machine model in edge intelligence can be reasonably split into parts which are collaboratively executed on mobile devices and edge servers such that the users' requirements for latency and inference accuracy are satisfied. However, the continuous deployment of edge nodes in the Internet of Things is extremely easy to leak private information. Moreover, edge intelligence involves a large number of edge nodes, edge servers and cloud servers to dynamically learn and inference. This multi-party and multi-stage interaction process is also extremely easy to leak privacy. Therefore, this kind of privacy leakage poses a new challenge to privacy issues for edge intelligence. In this project we study the privacy protection issues from data collecting, model training, predictive reasoning, and deployment of edge intelligence. In particular, we focus on multi-party differential privacy intermediary connection methods, asynchronous fair learning privacy, multi-level intelligent machine models, and the privacy problem of differential set in member/property inference attack, and utilize differential privacy, cryptography, multi-party secure computing and its hybrid mechanism to achieve privacy protection. Finally, we study privacy issues in edge intelligence deployment based on blockchain technology. The results of this project can provide important theoretical guidance and technical support for privacy protection in the application of artificial intelligence to the Internet of Things.

关键词（用分号分开）:边缘智能；服务部署；隐私保护；物联网；机器学习

Keywords (separated by;): Edge intelligence; Service deployment; Privacy protection; Internet of Things; Machine learning

```
 asynchronous federated learning; privacy-preserving federated learning based on group
 fairness; and distributed denial-of-service attacks in edge computing and their defense
 solutions. Through project execution, a total of 27 papers were published, including 21
 indexed in SCI and 6 in EI, with 4 patents filed or authorized, 2 software copyrights
 registered, 4 conference reports, and 1 invited presentation. Additionally, 10 graduate
 students were trained. In summary, this project successfully completed all planned
 research tasks, met all achievement indicators, and achieved the predetermined
 objectives.
 关键词（用分号分开）：边缘智能；联邦学习；隐私安全；模型攻击；防御方案
                                                                             Privacy
Keywords (separated by;): Edge Intelligence; Federated Learning;
 Security; Model Attack; Protect Scheme
```

## 2. 研究工作主要进展、结果和影响。

（1）主要研究内容。

根据项目计划任务书，本项目的研究内容主要包括以下四点:

1）边缘智能数据收集阶段的隐私保护:在物联网中，各种设备时刻产生大量异构数据，这些数据包含着各种各样的信息，而边缘智能提供方则收集、挖掘和利用这些数据来提供更优质的服务。但这些数据或多或少蕴含了设备或用户的某些私有信息，如何保证数据收集者不能窥探和利用这些私有信息是实现边缘智能的基础。①现有的数据收集多方隐私机制中，参与方包括产生数据的各种用户设备、收集数据的服务器及额外用以保护隐私的辅助服务器（或中间方服务器），且假定辅助服务器不会与数据收集服务器串谋，故用户设备将数据先发送到辅助服务器添加隐私保护，然后再转发给数据服务器。事实上，在足够代价下，辅助服务器和数据服务器极有可能串谋，从而导致用户隐私泄露。因此，我们拟引入多个辅助服务器用于处理数据和增强隐私，从而避免单辅助服务器与数据收集服务器串谋，因为实现数据服务器与多个辅助服务器串谋需要更大代价。②多辅助服务器模型下，由于存在为数众多的数据产生方、多辅助服务器、数据收集服务器及数据使用者等，故存在多种串谋方式。因此，我们拟研究在此模型下多参与方的各种串谋方式，并识别其中重要的影响大的串谋方式，从而有针对性地提出相应的隐私保护方案。③多辅助服务器模型下，我们拟研究多辅助服务器连接模式如何影响隐私和可用性，以及不同连接模式下如何设计相应的隐私机制。一般来说，数据隐私和可用性是一对矛盾，故我们拟研究多个辅助服务器在串行模式、并行模式及混合模式下对各种串谋方式的隐私与可用性的影响。

2）边缘智能模型训练阶段的隐私保护研究:由于边缘节点计算能力的限制，机器学习过程中需要将计算能力需求大的模型训练分散到多个边缘节点、边缘服务器甚至远程云服务器，因此需要研究边缘节点和服务器在数据交互过程中的隐私及学习效率问题。(①实际上，某些边缘节点用户考虑到自身计算能力及隐私等，不愿将数据上传到边缘服务而是直接参与联邦协作学习。这就给当前普遍研究的两层联邦学习带来不同，导致参与学习方除了云服务器、边缘服务器之外还有边缘节点。这就要求设计合理高效的协议用于三者之间的信息交互在该异构学习模型中，边缘服务器的角色比较特别，需要研究边缘服务器的角色定位及其对隐私聚合的影响。(2)移动的边缘节点导致网络拓扑结构频繁变化，例如用户节点移动会导致连接到不同的边缘服务器，而云服务器则通过边缘服