# -*- coding: utf-8 -*-
# Generated by Django 1.11 on 2017-06-30 17:59
from __future__ import unicode_literals

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('seqr', '0019_auto_20170630_1754'),
    ]

    operations = [
        migrations.AlterField(
            model_name='dataset',
            name='project',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, to='seqr.Project'),
        ),
    ]
