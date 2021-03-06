import logging
from django.core.management.base import CommandError
from reference_data.management.commands.utils.update_utils import GeneCommand, ReferenceDataHandler
from reference_data.models import TranscriptInfo, GeneConstraint

logger = logging.getLogger(__name__)


class GeneConstraintReferenceDataHandler(ReferenceDataHandler):

    model_cls = GeneConstraint
    url = "http://storage.googleapis.com/seqr-reference-data/gene_constraint/gnomad.v2.1.1.lof_metrics.by_gene.txt"

    def __init__(self, **kwargs):
        if TranscriptInfo.objects.count() == 0:
            raise CommandError("TranscriptInfo table is empty. Run './manage.py update_gencode' before running this command.")

        self.gene_reference = {t.transcript_id: t for t in TranscriptInfo.objects.all().prefetch_related('gene')}

    @staticmethod
    def parse_record(record):
        yield {
            'transcript_id': record['transcript'].split(".")[0],
            'mis_z': float(record['mis_z']),
            'pLI': float(record['pLI']) if record['pLI'] != 'NA' else 0,
        }

    def get_gene_for_record(self, record):
        transcript_id = record.pop("transcript_id")
        transcript = self.gene_reference.get(transcript_id)
        if not transcript:
            raise ValueError('transcript id "{}" not found in TranscriptInfo table'.format(transcript_id))

        return transcript.gene

    @staticmethod
    def post_process_models(models):
        # add _rank fields
        for field in ['mis_z', 'pLI']:
            for i, model in enumerate(sorted(models, key=lambda model: -1 * getattr(model, field))):
                setattr(model, '{}_rank'.format(field), i)


class Command(GeneCommand):
    reference_data_handler = GeneConstraintReferenceDataHandler
