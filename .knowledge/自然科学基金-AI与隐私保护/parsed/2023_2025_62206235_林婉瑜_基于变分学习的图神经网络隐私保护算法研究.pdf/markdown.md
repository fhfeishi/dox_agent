## 项目摘要

## 中文摘要:

图神经网络成功地将深度学习应用于图数据，将复杂的原始图结构映射为低维向量表征，用以拟合图数据的抽象特征，并将这种抽象的向量表征应用于诸如节点分类、图分类等下游任务中。然而这些向量表征通常隐含着数据的敏感信息，易受攻击者的推理攻击而导致数据隐私信息泄漏。现有的面向图神经网络隐私保护算法存在计算量大导致扩展性差、隐私效用权衡次优等局限性。本项目将针对上述局限性，研究如何实现面向图神经网络的隐私保护算法。具体地，本项目将重点研究如何结合变分学习模型与差分隐私技术实现面向图级别隐私保护算法，并解决计算效率问题使其具备可扩展性。针对隐私效用权衡次优问题，本项目将不依赖于特定攻击假设，通过引入隐私漏斗优化器结合变分学习模型，实现面向节点分类、图分类且具备隐私效用最优权衡的隐私保护算法。项目最终将形成一套面向图神经网络的隐私保护算法原型系统，并在多个基准测试数据集以及若干应用场景中完成效果验证与示范。

## Abstract:

Graph neural networks successfully generalize deep learning on graph data. Graph neural networks can map complex graph-structural data into low-dimensional representations for various downstream tasks, such as node classification and graph classification. However, these representations usually contain sensitive data information vulnerable to privacy inference attacks, leading to severe data privacy leakage. Existing privacy-preserving graph neural networks have limitations, including extensive computation and sub-optimal privacy-utility tradeoff. This project will address the above limitations and design privacy-preserving algorithms for graph neural networks. Specifically, this project will first focus on incorporating the variational learning model and differential privacy to implement graph-level privacy-preserving algorithms and solve the problem of computational efficiency to make it scalable. Second, to address the suboptimal problem of privacy-utility tradeoff, this project will design privacy-preserving algorithms with the optimal privacy-utility tradeoff based on privacy-funnel optimizer incorporated with variational learning models. The project will form a graph neural network-oriented privacy-preserving algorithm prototype system and verify the effectiveness in multiple benchmark datasets and application scenarios. This project will lead to internationally leading research achievements and provide great talent training opportunities.

关键词（用分号分开）:图神经网络；数据隐私；变分图自编码器；差分隐私；隐私漏斗

Keywords (separated by;): Graph Neural Networks; Data Privacy; Variational Graph Auto-Encoder; Differential Privacy; Privacy Funnel

## 结题摘要

## 中文摘要（对项目的背景、主要研究内容、重要结果、关键数据及其科学意义等做简单概述）:

随着图神经网络在推荐系统、金融风控、社会网络分析与智慧城市等实际应用场景中的广泛部署，基于图结构数据的智能决策在显著提升业务效率的同时，也暴露出隐私泄露、算法偏置以及模型稳定性不足等问题。在隐私敏感和强监管场景下，传统以预测性能为主要目标的图神经网络模型难以在隐私保护、决策公平与模型可信性之间取得有效平衡，成为制约相关技术工程化落地的关键瓶颈。围绕上述问题，本项目以基于变分学习的图神经网络隐私保护算法为核心研究主线，系统开展了理论建模与方法研究。针对图神经网络表示中隐含敏感信息易被推断的问题，项目提出了基于隐私漏斗与变分学习的图表示优化方法，通过将隐私-效用权衡刻画为统一的信息论目标，在不依赖对抗训练的前提下，实现了对节点敏感属性信息的有效抑制。该方法在多个推荐与关系预测任务中显著提升了隐私安全性与训练稳定性，系统性解决了现有对抗式隐私保护方法易不稳定、难扩展的问题。进一步地，针对隐私保护与公平决策在实际应用中的内在关联，本项目引入信息瓶颈原理，构建了兼顾预测性能与群体公平性的变分图表示学习框架，从信息论角度刻画并缓解了图结构同质性导致的算法偏置问题。相关研究为金融信贷、司法辅助决策等高风险应用场景中的公平建模提供了统一且可解释的理论基础，构成了本项目在隐私保护与公平学习方向上的另一项核心成果。在上述核心研究基础上，项目还开展了若干拓展性研究:针对数据分散场景，探索了图关系感知的联邦学习方法；针对模型可信需求，研究了面向图神经网络的忠实可解释方法；针对标注数据稀缺问题，提出了多视角子图自监督学习方法，以增强方法在实际应用中的适用性与完整性。本项目共支持发表高水平学术论文10篇，包括1篇CCF A类国际会议论文 3篇CCF A类国际期刊论文 4篇CCF B类国际期刊论文；培养博士研究生7名，科研助理4名。 项目基本完成并在部分方面超额完成各项预期指标。

# Abstract (Brief description of research background, main methods, contributions, and research data):

With the widespread deployment of graph neural networks (GNNs) in real-world applications such as recommender systems, financial risk control, social network analysis, and smart cities, intelligent decision-making based on graph-structured data has greatly improved operational efficiency. At the same time, critical challenges have emerged, including privacy leakage, algorithmic bias, and limited model robustness. In privacy-sensitive and strongly regulated scenarios, GNN models that focus primarily on predictive accuracy struggle to balance privacy protection, decision fairness, and model trustworthiness, which has become a key bottleneck for practical deployment. To address these challenges, this project centers on variational-learning-based privacy-preserving graph neural networks and conducts systematic theoretical modeling and methodological research. To prevent sensitive attributes from being inferred through graph representations, we propose a graph representation optimization method based on the privacy funnel and variational learning. By formulating the privacy -utility trade-off as a unified information-theoretic objective, the proposed approach effectively suppresses sensitive node information without relying on adversarial training. Experimental results on recommendation and relational prediction tasks show significant improvements in privacy protection and training stability, addressing the instability and scalability issues of existing adversarial methods. Furthermore, motivated by the close relationship between privacy protection and fair decision-making, the project introduces the information bottleneck principle to develop a variational graph representation learning framework that jointly considers predictive performance and group fairness. From an information-theoretic perspective, this framework characterizes and mitigates algorithmic bias induced by graph homophily, providing a unified and interpretable foundation for fairness-aware modeling in high-risk applications such as financial credit assessment and judicial decision support. In addition to the core contributions, the project explores several extensions, including graph-relation-aware

```
 federated learning for decentralized data, faithful interpretability methods for GNNs,
 and multi-view subgraph self-supervised learning to alleviate label scarcity and enhance
 practical applicability. This project has supported the publication of 10 high-quality
academic papers, including 4 CCF-A papers, and 4 CCF-B international journal papers, and
 has trained 7 PhD students, and 4 research assistants. Overall, the project has
 successfully completed, and in some aspects exceeded its expected objectives.
 关键词（用分号分开）：图神经网络；数据隐私；变分图自编码器；差分隐私；
 隐私漏斗
Keywords (separated by;): Graph Neural Networks; Data Privacy;             Variational
 Auto Encoder; Differential Privacy; Privacy Funnel
```

## 正文

《结题/成果报告》正文分为两个部分:结题部分和成果部分。请按照《结题成果报告》填报说明及撰写要求填写。

## （一）结题部分

## 1. 研究计划执行情况概述。

（1）按计划执行情况。

本项目严格按照立项时制定的年度研究计划稳步推进，整体研究进度与实施安排与原计划保持一致，各阶段任务均按期完成。

在项目执行初期（2023年)，课题组系统调研了图神经网络隐私保护与公平学习相关理论与方法，梳理并分析了差分隐私、变分学习、隐私漏斗和信息瓶颈等技术路线，在此基础上明确了整体研究框架与实验方案，并完成了图级与节点级任务数据集的整理与构建，为后续方法研究奠定了基础。

在项目中期（2024年)，课题组围绕既定研究目标，重点开展了基于变分学习的图隐私保护方法、基于信息瓶颈的公平图表示学习方法以及面向分布式场景的图联邦学习研究，形成了一系列可扩展、稳定的模型与算法。同时，通过国内外学术交流与合作，持续对研究方案进行优化与验证，相关成果陆续投稿并发表在国际高水平期刊和会议上。

在项目后期（2025年)，在前期研究成果的基础上，课题组进一步完善了面向隐私保护、公平决策与分布式建模的图神经网络方法体系，并在多个真实数据集和应用场景中完成了系统性实验验证与对比分析。同时，项目按计划完成了阶段总结、成果凝练与结题准备工作，整体执行情况良好。

## （2）研究目标完成情况。

本项目围绕“基于变分学习的图神经网络隐私保护算法研究”这一总体目标，已基本完成并在部分方面超额完成了立项时提出的研究目标。

在科学目标方面，项目系统研究了图神经网络中隐私泄露、公平性偏置以及分布式数据协同建模等关键问题，提出了多种基于变分学习、信息论建模与联邦学习的图表示学习方法，有效缓解了传统对抗式方法在稳定性与隐私-效用权衡方面的不足，丰富了图神经网络隐私保护与公平学习的理论与方法体系。

在成果产出方面，在本项目支持下共发表高水平学术论文10篇，其中包括