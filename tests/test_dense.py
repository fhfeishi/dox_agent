from types import SimpleNamespace

from src.dense import DenseIndex, fuse_rankings
from src.knowledge import Knowledge


def test_no_model_does_not_initialize_dense(tmp_path):
    store = Knowledge(tmp_path / "knowledge.db", settings=SimpleNamespace(embedding_path=""))
    assert store.dense is None


def test_rrf_rewards_agreement():
    assert fuse_rankings([0, 1], [2, 1], 3)[0] == 1


def test_chroma_sync_reuses_and_removes_versions(tmp_path):
    import pytest
    pytest.importorskip("langchain_chroma")
    from langchain_chroma import Chroma
    from langchain_core.embeddings import Embeddings

    class LocalTestEmbeddings(Embeddings):
        def embed_documents(self, texts):
            return [[float("foundation" in text), 1.0] for text in texts]

        def embed_query(self, text):
            return self.embed_documents([text])[0]

    model = tmp_path / "model"
    model.mkdir()
    (model / "config.json").write_text("{}")
    index = DenseIndex(tmp_path / "vectors", str(model), "cpu", "")
    index.store = Chroma(collection_name="test-sync", embedding_function=LocalTestEmbeddings(), persist_directory=str(tmp_path / "vectors"))
    assert index.search("foundation", ["foundation"], [{"version": "old"}], 6) == [0]
    first_ids = index.store.get()["ids"]
    index.search("foundation", ["foundation"], [{"version": "old"}], 6)
    assert index.store.get()["ids"] == first_ids
    index.search("foundation", ["foundation new"], [{"version": "new"}], 6)
    assert len(index.store.get()["ids"]) == 1
    assert index.store.get()["ids"] != first_ids
